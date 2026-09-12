// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyDyKTeaXpNsIN9fhoFg3EZRLv6N3Nr2h-0",
  authDomain: "tech-challenge-finance-mobile.firebaseapp.com",
  projectId: "tech-challenge-finance-mobile",
  storageBucket: "tech-challenge-finance-mobile.firebasestorage.app",
  messagingSenderId: "1018875833545",
  appId: "1:1018875833545:web:590b7c3638d3b4501af118"
};

// Initialize Firebase
export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);