import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendPasswordResetEmail,
  signOut,
  setPersistence,
  browserLocalPersistence,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  getDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

// Firebase Config
const firebaseConfig = {
  apiKey: "AIzaSyC4DHI8aBVY4JjTvJ-r-TGIDPsewtEWxzU",
  authDomain: "silent-depth.firebaseapp.com",
  projectId: "silent-depth",
  storageBucket: "silent-depth.firebasestorage.app",
  messagingSenderId: "78008755450",
  appId: "1:78008755450:web:3fd0f0f298a08820935543",
  measurementId: "G-WSWDCB7KD8"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
setPersistence(auth, browserLocalPersistence);

/* ---------------- SIGNUP ---------------- */
const signupForm = document.getElementById("signup-form");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("signup-username").value.trim() || "Anonymous";
    const email = document.getElementById("signup-email").value;
    const password = document.getElementById("signup-password").value;

    try {
      // Check if username exists
      const q = query(collection(db, "users"), where("username", "==", username));
      const querySnap = await getDocs(q);
      if (!querySnap.empty) {
        document.getElementById("signup-status").textContent = "⚠ Username already taken.";
        return;
      }

      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      // Save user to Firestore with "joined"
      await setDoc(doc(db, "users", uid), {
        username,
        email,
        bio: "",
        joined: new Date() // ✅ this is the field profile will fetch
      });

      document.getElementById("signup-status").textContent = "✅ Account created! Redirecting to login…";
      setTimeout(() => window.location.href = "users-login.html", 1200);

    } catch (err) {
      document.getElementById("signup-status").textContent = "⚠ " + err.message;
    }
  });
}

/* ---------------- LOGIN ---------------- */
const loginForm = document.getElementById("login-form");
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    let loginInput = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    try {
      let emailToUse = loginInput;

      // If input is not email, search by username
      if (!loginInput.includes("@")) {
        const q = query(collection(db, "users"), where("username", "==", loginInput));
        const querySnap = await getDocs(q);
        if (querySnap.empty) {
          document.getElementById("login-status").textContent = "⚠ No account found with that username.";
          return;
        }
        emailToUse = querySnap.docs[0].data().email;
      }

      const userCred = await signInWithEmailAndPassword(auth, emailToUse, password);
      const user = userCred.user;

      // Ensure Firestore doc exists with "joined"
      const userDocRef = doc(db, "users", user.uid);
      const userDocSnap = await getDoc(userDocRef);

      if (!userDocSnap.exists()) {
        await setDoc(userDocRef, {
          username: user.displayName || "Anonymous",
          email: user.email,
          bio: "",
          joined: new Date()
        });
      } else {
        // If doc exists but missing "joined", set it
        const data = userDocSnap.data();
        if (!data.joined) await updateDoc(userDocRef, { joined: new Date() });
      }

      document.getElementById("login-status").textContent = "✅ Login successful! Redirecting…";
      setTimeout(() => window.location.href = "index.html", 1200);

    } catch (err) {
      document.getElementById("login-status").textContent = "⚠ " + err.message;
    }
  });
}

/* ---------------- RESET PASSWORD ---------------- */
const resetForm = document.getElementById("reset-form");
if (resetForm) {
  resetForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("reset-email").value.trim();
    try {
      await sendPasswordResetEmail(auth, email);
      document.getElementById("reset-status").textContent = "✅ Password reset email sent! Check your inbox.";
    } catch (err) {
      document.getElementById("reset-status").textContent = "⚠ " + err.message;
    }
  });
}

/* ---------------- LOGOUT + SHOW USER ---------------- */
function logoutUser() {
  signOut(auth).then(() => {
    localStorage.removeItem("lastPage");
    window.location.href = "users-login.html";
  }).catch(err => alert("Failed to log out: " + err.message));
}

onAuthStateChanged(auth, async (user) => {
  const userInfoDiv = document.getElementById("user-info");
  const logoutBtn = document.getElementById("logoutBtn");

  if (user) {
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);

    let username = "Anonymous";
    if (docSnap.exists()) username = docSnap.data().username || "Anonymous";

    if (userInfoDiv) userInfoDiv.textContent = `👋 Welcome, ${username}`;
    if (logoutBtn) {
      logoutBtn.style.display = "inline-block";
      logoutBtn.onclick = logoutUser;
    }
  } else {
    if (userInfoDiv) userInfoDiv.textContent = "";
    if (logoutBtn) logoutBtn.style.display = "none";
  }
});
