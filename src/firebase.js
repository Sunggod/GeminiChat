import { initializeApp } from 'firebase/app';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyCaVzywfweyQtdGosQ9UMLVdTIpmd_nGVU",
    authDomain: "chat-gemini-aef99.firebaseapp.com",
    projectId: "chat-gemini-aef99",
    storageBucket: "chat-gemini-aef99.appspot.com",
    messagingSenderId: "1044480653169",
    appId: "1:1044480653169:web:cf133941bcc091a46b28d0"
  };
const app = initializeApp(firebaseConfig);
const storage = getStorage(app);

export { storage };
