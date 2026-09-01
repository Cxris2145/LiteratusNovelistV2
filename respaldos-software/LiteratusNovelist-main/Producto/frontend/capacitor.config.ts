import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.literatus.novelist',
  appName: 'Literatus Novelist',
  webDir: 'dist/frontend/browser',
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#0b0f1a',
      showSpinner: false
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: '#0b0f1a'
    }
  },
  server: {
    // Permite que la app se comunique con el backend en producción
    allowNavigation: ['literatus-novelist-backend.onrender.com']
  }
};

export default config;
