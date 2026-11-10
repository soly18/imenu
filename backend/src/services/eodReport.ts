import type { Pool, PoolConnection } from 'mysql2/promise';
import type {
  EodReport, EodDeclarationRow, EodPaymentRow, PaymentMethod,
} from '@imenu25/shared';

type Db = Pool | PoolConnection;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/** Payment methods a manager counts and declares at the end of the day (not tab / points). */
export const DECLARABLE_METHODS: PaymentMethod[] = [
  'cash', 'credit_card', 'cheque', 'voucher', 'gift_card',
];

export async function dbNow(db: Db): Promise<Date> {
  const [[row]]: any = await db.execute('SELECT NOW() AS now');
  return row.now;
}

/**
 * Where the current period starts: the end of the last Z report. Before the first Z it
 * starts at the first order ever opened (or now, if there are none).
 */
export async function getPeriodStart(db: Db, branchId: number): Promise<Date> {
  const [zs]: any = await db.execute(
    'SELECT period_end FROM z_reports WHERE branch_id = ? ORDER BY report_number DESC LIMIT 1',
    [branchId]
  );
  if (zs.length) return zs[0].period_end;
  const [[o]]: any = await db.execute(
    'SELECT MIN(opened_at) AS first FROM orders WHERE branch_id = ?', [branchId]
  );
  return o.first ?? (await dbNow(db));
}

// What belongs to the current period: paid orders (and voided items) that no Z report has
// claimed yet. Time is never compared, so a sale in the same second as a Z cannot be lost.
const PAID = `o.branch_id = ? AND o.status = 'paid' AND o.z_report_id IS NULL`;
const EXTRAS = `LEFT JOIN (SELECT order_item_id, SUM(extra_price) AS extras
                           FROM order_item_choices GROUP BY order_item_id) ex ON ex.order_item_id = oi.id`;
const ITEM_GROSS = `(oi.total_price + COALESCE(ex.extras, 0) * oi.quantity)`;

export interface BuildOptions {
  kind: 'X' | 'Z';
  branchId: number;
  from: Date;   // shown on the report (period start / end); not used to select data
  to: Date;
  generatedBy: string;
  generatedAt: Date;
  reportNumber?: number | null;
  autoClockedOut?: string[];
  autoCancelledOrders?: number;
}

export async function buildReport(db: Db, o: BuildOptions): Promise<EodReport> {
  const p = [o.branchId];

  const [[branch]]: any = await db.execute('SELECT name FROM branches WHERE id = ?', [o.branchId]);

  const [[sum]]: any = await db.execute(
    `SELECT COUNT(*) AS orders, COALESCE(SUM(o.guest_count), 0) AS guests,
            COALESCE(SUM(o.subtotal), 0) AS gross, COALESCE(SUM(o.discount_total), 0) AS discounts,
            COALESCE(SUM(o.total), 0) AS net, COALESCE(SUM(o.vat_total), 0) AS vat
     FROM orders o WHERE ${PAID}`, p
  );

  const [pay]: any = await db.execute(
    `SELECT pm.method, COUNT(*) AS count, SUM(pm.amount) AS amount
     FROM payments pm JOIN orders o ON o.id = pm.order_id
     WHERE ${PAID} GROUP BY pm.method ORDER BY amount DESC`, p
  );

  const [groups]: any = await db.execute(
    `SELECT mg.id AS groupId, mg.name_primary AS namePrimary, mg.name_secondary AS nameSecondary,
            SUM(oi.quantity) AS quantity, SUM(${ITEM_GROSS}) AS amount
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     JOIN menu_groups mg ON mg.id = mi.group_id
     ${EXTRAS}
     WHERE ${PAID} AND oi.is_voided = 0
     GROUP BY mg.id, mg.name_primary, mg.name_secondary ORDER BY amount DESC`, p
  );

  const [emps]: any = await db.execute(
    `SELECT e.id AS employeeId, CONCAT(e.first_name, ' ', e.last_name) AS name,
            COUNT(*) AS orders, SUM(o.total) AS amount
     FROM orders o JOIN employees e ON e.id = o.employee_id
     WHERE ${PAID} GROUP BY e.id, e.first_name, e.last_name ORDER BY amount DESC`, p
  );

  const [discs]: any = await db.execute(
    `SELECT COALESCE(od.label, od.type) AS label, od.type AS type, COUNT(*) AS count,
            SUM(CASE WHEN od.type = 'percent' THEN od.value / 100 * o.subtotal ELSE od.value END) AS amount
     FROM order_discounts od JOIN orders o ON o.id = od.order_id
     WHERE ${PAID} GROUP BY COALESCE(od.label, od.type), od.type ORDER BY amount DESC`, p
  );

  // VAT per rate: gross by rate (scaled by any order discount), then VAT is the part of it
  const [vatRows]: any = await db.execute(
    `SELECT mi.vat_rate AS rate,
            SUM(${ITEM_GROSS} * (o.total / NULLIF(o.subtotal, 0))) AS gross
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     JOIN menu_items mi ON mi.id = oi.menu_item_id
     ${EXTRAS}
     WHERE ${PAID} AND oi.is_voided = 0
     GROUP BY mi.vat_rate ORDER BY mi.vat_rate`, p
  );

  // Voided items stay in the period until a Z claims them
  const [voidRows]: any = await db.execute(
    `SELECT oi.void_reason AS reason, CONCAT(e.first_name, ' ', e.last_name) AS employeeName,
            COUNT(*) AS count, SUM(${ITEM_GROSS}) AS amount
     FROM order_items oi
     JOIN orders o ON o.id = oi.order_id
     LEFT JOIN employees e ON e.id = oi.void_by
     ${EXTRAS}
     WHERE o.branch_id = ? AND oi.is_voided = 1 AND oi.z_report_id IS NULL
     GROUP BY oi.void_reason, e.id, e.first_name, e.last_name ORDER BY amount DESC`, p
  );

  const [declRows]: any = await db.execute(
    'SELECT method, amount FROM declarations WHERE branch_id = ? AND z_report_id IS NULL', [o.branchId]
  );

  const byPayment: EodPaymentRow[] = pay.map((r: any) => ({
    method: r.method, count: Number(r.count), amount: round2(Number(r.amount)),
  }));

  const declarations: EodDeclarationRow[] = [];
  for (const method of DECLARABLE_METHODS) {
    const expected = byPayment.find((r) => r.method === method)?.amount ?? 0;
    const d = declRows.find((r: any) => r.method === method);
    const declared = d ? round2(Number(d.amount)) : null;
    if (method === 'cash' || method === 'credit_card' || expected > 0 || declared !== null) {
      declarations.push({
        method, expected,
        declared,
        difference: declared === null ? null : round2(declared - expected),
      });
    }
  }

  const voids = voidRows.map((r: any) => ({
    reason: r.reason ?? null, employeeName: r.employeeName ?? null,
    count: Number(r.count), amount: round2(Number(r.amount)),
  }));
  const orders = Number(sum.orders);
  const net = round2(Number(sum.net));

  return {
    kind: o.kind,
    reportNumber: o.reportNumber ?? null,
    branchName: branch?.name ?? '',
    periodStart: o.from.toISOString(),
    periodEnd: o.to.toISOString(),
    generatedAt: o.generatedAt.toISOString(),
    generatedBy: o.generatedBy,
    summary: {
      orders, guests: Number(sum.guests),
      gross: round2(Number(sum.gross)), discounts: round2(Number(sum.discounts)),
      net, vat: round2(Number(sum.vat)),
      avgCheck: orders ? round2(net / orders) : 0,
      voidsCount: voids.reduce((a: number, v: any) => a + v.count, 0),
      voidsTotal: round2(voids.reduce((a: number, v: any) => a + v.amount, 0)),
    },
    byPayment,
    byGroup: groups.map((r: any) => ({
      groupId: r.groupId, namePrimary: r.namePrimary, nameSecondary: r.nameSecondary ?? null,
      quantity: Number(r.quantity), amount: round2(Number(r.amount)),
    })),
    byEmployee: emps.map((r: any) => ({
      employeeId: r.employeeId, name: r.name, orders: Number(r.orders), amount: round2(Number(r.amount)),
    })),
    discounts: discs.map((r: any) => ({
      label: r.label, type: r.type, count: Number(r.count), amount: round2(Number(r.amount)),
    })),
    vat: vatRows.map((r: any) => {
      const rate = Number(r.rate);
      const gross = round2(Number(r.gross));
      const vat = round2(gross * rate / (100 + rate));
      return { rate, gross, vat, base: round2(gross - vat) };
    }),
    voids,
    declarations,
    declarationsEntered: declRows.length > 0,
    autoClockedOut: o.autoClockedOut ?? [],
    autoCancelledOrders: o.autoCancelledOrders ?? 0,
  };
}
