import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.imenu25.pos',
  appName: 'iMenu25',
  webDir: 'dist',
  server: {
    // The app talks to the iMenu25 server on the restaurant's Wi-Fi over plain http://,
    // so Android must be allowed to make cleartext requests from the WebView.
    androidScheme: 'http',
    cleartext: true,
  },
  android: { allowMixedContent: true },
};

export default config;
