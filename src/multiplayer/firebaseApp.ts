// App do Firebase (projeto b-side-c1322), partilhada pelas sessões da TV e pela IA dos títulos.
// A configuração web do Firebase não é secreta: o acesso é controlado por database.rules.json.
import { initializeApp } from 'firebase/app';

// Testes locais: `?emulator` na página usa os emuladores do Firebase (npm run emulators), num projeto
// demo- que nunca fala com a Google. Aí o login fica só em memória, para a TV e vários "telemóveis"
// poderem ser separadores do mesmo browser.
export const emulator = new URLSearchParams(location.search).has('emulator');

export const app = initializeApp(emulator
  ? { apiKey: 'demo', projectId: 'demo-b-side', databaseURL: 'https://demo-b-side-default-rtdb.firebaseio.com' }
  : {
    apiKey: 'AIzaSyCFPbBMp-YG-59H0b32DeNby6bvqRwXXBk',
    authDomain: 'b-side-c1322.firebaseapp.com',
    databaseURL: 'https://b-side-c1322-default-rtdb.europe-west1.firebasedatabase.app',
    projectId: 'b-side-c1322',
    appId: '1:483519232221:web:42a6a6f94a52ed3ab0c334',
  });
