import { 
  initializeApp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import { 
  getFirestore, collection, query, orderBy, limit, getDocs, doc, getDoc, where,
  enableIndexedDbPersistence, startAfter, updateDoc, increment, addDoc, arrayUnion 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";

// Firebase config
const firebaseConfig = {
  apiKey: "AIzaSyC4DHI8aBVY4JjTvJ-r-TGIDPsewtEWxzU",
  authDomain: "silent-depth.firebaseapp.com",
  projectId: "silent-depth",
  storageBucket: "silent-depth.appspot.com",
  messagingSenderId: "78008755450",
  appId: "1:78008755450:web:3fd0f0f298a08820935543"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth();


// ============================================
// RENCE BLUNT FILTER - UID for filtering
// ============================================
const RENCE_BLUNT_UID = "1Ou084CsNaf115Jw4NcTomVyPOZ2";

// Helper function to check if a poem is by Rence Blunt
function isRenceBluntPoem(poemData) {
  return poemData.userId === RENCE_BLUNT_UID || 
         poemData.authorId === RENCE_BLUNT_UID || 
         poemData.submittedBy === RENCE_BLUNT_UID ||
         poemData.author === "Rence Blunt" ||
         poemData.authorName === "Rence Blunt";
}

// Helper function to escape HTML
function escapeHtml(str) {
  if (!str) return "";
  return str.replace(/[&<>]/g, function(m) {
    if (m === '&') return '&amp;';
    if (m === '<') return '&lt;';
    if (m === '>') return '&gt;';
    return m;
  });
}

// --- Truncate helper function ---
function truncatePoem(text, lines = 8) {
  if (!text || typeof text !== 'string') {
    return { preview: '', full: '', truncated: false };
  }
  const allLines = text.split(/\r?\n/);
  if (allLines.length <= lines) {
    return { preview: text, full: text, truncated: false };
  }
  return {
    preview: allLines.slice(0, lines).join("\n"),
    full: text,
    truncated: true
  };
}
// Track pagination
let lastVisible = null;
let reachedEnd = false;

// Helper function to redirect to login with return URL
function redirectToLogin() {
  const currentPage = window.location.href;
  localStorage.setItem('redirectAfterLogin', currentPage);
  window.location.href = `users-login.html?redirect=${encodeURIComponent(currentPage)}`;
}

// Helper function to redirect to signup with return URL
function redirectToSignup() {
  const currentPage = window.location.href;
  localStorage.setItem('redirectAfterSignup', currentPage);
  window.location.href = `users-signup.html?redirect=${encodeURIComponent(currentPage)}`;
}

// --- Structured Data Injection for SEO ---
function addPoemSchema(poem) {
  document.querySelectorAll('script[type="application/ld+json"].poem-schema').forEach(el => el.remove());
  const schema = {
    "@context": "https://schema.org",
    "@type": "Poem",
    "name": poem.title,
    "author": { "@type": "Person", "name": "Rence Blunt" },
    "publisher": { "@type": "Organization", "name": "Volate Poetry", "url": "https://renceblunt.github.io" },
    "inLanguage": "en",
    "url": `https://renceblunt.github.io/poems/${poem.slug || poem.title.toLowerCase().replace(/\s+/g, "-")}`,
    "datePublished": poem.date || "2025-01-01",
    "description": poem.description || "A poem from Volate Poetry by Rence Blunt."
  };
  const script = document.createElement("script");
  script.type = "application/ld+json";
  script.classList.add("poem-schema");
  script.textContent = JSON.stringify(schema, null, 2);
  document.head.appendChild(script);
}
// --- Weekly Highlights ---
// Helper function to get UID from username
async function getUidByUsername(username) {
  if (!username) return null;
  
  try {
    const usersRef = collection(db, "users");
    const q = query(usersRef, where("username", "==", username));
    const querySnapshot = await getDocs(q);
    
    if (!querySnapshot.empty) {
      return querySnapshot.docs[0].id;
    }
  } catch (err) {
    console.warn("Could not find user by username:", err);
  }
  return null;
}
// --- Weekly Highlights ---
async function loadWeeklyHighlights() {
  try {
    // Load Quote of the Week (works on both pages)
    const quoteSnap = await getDoc(doc(db, "weeklyHighlights", "weeklyQuote"));
    if (quoteSnap.exists()) {
      const data = quoteSnap.data();
      const quoteHTML = data.quote.replace(/\n/g, "<br>");
      
      const quoteElement = document.getElementById("weekly-quote");
      const authorElement = document.getElementById("quote-author");
      
      if (quoteElement) {
        quoteElement.innerHTML = `<em>“${quoteHTML}”</em>`;
      }
      
      if (authorElement && data.author) {
        // Get UID from username (same as poem cards)
        const authorName = data.author;
        const userUid = await getUidByUsername(authorName);
        
        // Create link with UID if found - exactly like poem cards
        const profileLink = userUid 
          ? `/user-profile.html?uid=${encodeURIComponent(userUid)}`
          : "#";
        
        const authorLink = `<a href="${profileLink}" 
                               style="color: #B8860B; text-decoration:none; cursor:pointer;"
                               onmouseover="this.style.textDecoration='underline'"
                               onmouseout="this.style.textDecoration='none'">
                               ${escapeHtml(authorName)}
                             </a>`;
        authorElement.innerHTML = `<br>~ ${authorLink}`;
      } else if (authorElement) {
        authorElement.innerHTML = "";
      }
    }

    // Load Poem of the Week - ONLY if the required elements exist on the page
    const poemContainer = document.getElementById("weekly-poem");
    const poemAuthor = document.getElementById("poem-author");
    const poemTitle = document.getElementById("poem-title");
    
    // Only try to load the poem if ALL required elements exist
    if (poemContainer && poemTitle) {
      const poemSnap = await getDoc(doc(db, "weeklyHighlights", "weeklyPoem"));
      if (poemSnap.exists()) {
        const data = poemSnap.data();
        const title = data.title || "Untitled";
        const author = data.author || "";
        const content = data.content || "";
        const lines = content.split("\n");
        const firstPart = lines.slice(0, 8).join("<br>");
        const restPart = lines.slice(8).join("<br>");
        
        poemTitle.innerHTML = `<h3 class="poem-title">${escapeHtml(title)}</h3>`;
        
        const wrapperId = "poem-wrapper";
        poemContainer.innerHTML = `
          <div id="${wrapperId}">
            <div class="poem-text">
              <span class="first-lines">${firstPart}</span>
              <span class="more-lines" style="display:none;">${restPart ? "<br>" + restPart : ""}</span>
            </div>
            ${lines.length > 8 ? '<button class="toggle-poem">Read more</button>' : ""}
          </div>
        `;
        
        if (poemAuthor && author) {
          // Get UID from username - exactly like poem cards
          const userUid = await getUidByUsername(author);
          
          // Create link with UID if found - exactly like poem cards
          const profileLink = userUid 
            ? `/user-profile.html?uid=${encodeURIComponent(userUid)}`
            : "#";
          
          const authorLink = `<a href="${profileLink}" 
                                 style="color: #B8860B; text-decoration:none; cursor:pointer;"
                                 onmouseover="this.style.textDecoration='underline'"
                                 onmouseout="this.style.textDecoration='none'">
                                 ${escapeHtml(author)}
                               </a>`;
          poemAuthor.innerHTML = `<hr class="poem-separator"><div class="poem-author">~ ${authorLink}</div>`;
        } else if (poemAuthor) {
          poemAuthor.innerHTML = "";
        }

        if (lines.length > 8) {
          const wrapper = document.getElementById(wrapperId);
          if (wrapper) {
            const toggleBtn = wrapper.querySelector(".toggle-poem");
            const moreLines = wrapper.querySelector(".more-lines");
            if (toggleBtn && moreLines) {
              toggleBtn.addEventListener("click", () => {
                const isHidden = moreLines.style.display === "none";
                moreLines.style.display = isHidden ? "inline" : "none";
                toggleBtn.textContent = isHidden ? "Read less" : "Read more";
              });
            }
          }
        }
      }
    }
  } catch (err) {
    console.error("Error fetching weekly highlights:", err);
  }
}
// --- Recent Poems with Pagination (FOR ALL USERS) ---

let loading = false;
const batchSize = 10;
let allPoemsCache = []; // Cache all poems
let currentIndex = 0;

async function loadPoemsBatch() {
  if (loading || reachedEnd) return;
  loading = true;

  const container = document.getElementById("recent-poems-container");
  if (!container) return;

  try {
    // If cache is empty, fetch all poems without filtering
    if (allPoemsCache.length === 0) {
      const colRef = collection(db, "recentPoems");
      const snapshot = await getDocs(colRef);
      
      const poems = [];
      for (const docSnap of snapshot.docs) {
        const poem = docSnap.data();
        poems.push({
          id: docSnap.id,
          ...poem,
          timestamp: poem.timestamp?.toMillis?.() || 0
        });
      }
      
      // Sort by timestamp descending
      poems.sort((a, b) => b.timestamp - a.timestamp);
      allPoemsCache = poems;
    }
    
    if (allPoemsCache.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:60px 20px; color:#7a6a5a;">📜 No poems yet. Be the first to share!</div>';
      reachedEnd = true;
      loading = false;
      return;
    }
    
    // Get batch
    const start = currentIndex;
    const end = Math.min(start + batchSize, allPoemsCache.length);
    
    if (start >= allPoemsCache.length) {
      reachedEnd = true;
      loading = false;
      return;
    }
    
    const batch = allPoemsCache.slice(start, end);
    
    for (const poem of batch) {
      const docId = poem.id;

      // Create poem card
      const card = document.createElement("div");
      card.className = "recent-poem-card";
      card.dataset.id = docId;

      const truncated = truncatePoem(poem.content, 8);
      const likes = typeof poem.likes === "number" ? poem.likes : 0;

      // Helper functions for initials avatar
      function getInitials(name = "") {
        const parts = name.trim().split(" ");
        if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
      }

      function colorFromName(name = "") {
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
          hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        const hue = Math.abs(hash) % 360;
        return `hsl(${hue}, 60%, 45%)`;
      }

      function generateAvatarImage(initials, bgColor, size = 180) {
        const canvas = document.createElement("canvas");
        canvas.width = canvas.height = size;
        const ctx = canvas.getContext("2d");

        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, size, size);

        ctx.fillStyle = "#ffffff";
        ctx.font = `${size * 0.5}px 'Playfair Display', serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(initials, size / 2, size / 2);

        return new Promise(resolve => {
          canvas.toBlob(blob => resolve(blob), "image/png");
        });
      }

      async function uploadAvatarToCloudinary(initials, bgColor, poetUid, publicId = null) {
        const blob = await generateAvatarImage(initials, bgColor);
        const formData = new FormData();
        formData.append("file", blob);
        formData.append("upload_preset", "profile_pics");
        if (publicId) formData.append("public_id", publicId);

        const cloudName = "dzoq4pgjn";

        try {
          const res = await fetch(`https://api.cloudinary.com/v1_1/${cloudName}/image/upload`, {
            method: "POST",
            body: formData
          });
          const data = await res.json();
          const imageUrl = data.secure_url;

          await updateDoc(doc(db, "users", poetUid), { cachedAvatarURL: imageUrl });
          return imageUrl;
        } catch (err) {
          console.error("Cloudinary upload failed:", err);
          return null;
        }
      }
      
      // --- Author info for poem card ---
      const poetUid = poem.authorId;
      let displayName = "Anonymous Poet";
      let profileLink = "#";
      let profileImage = "/images/default-avatar.png";

      if (poetUid) {
        try {
          const userDoc = await getDoc(doc(db, "users", poetUid));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            displayName = userData.username || displayName;
            profileLink = `/user-profile.html?uid=${encodeURIComponent(poetUid)}`;

            if (userData.photoURL) {
              profileImage = userData.photoURL;
            } else if (userData.cachedAvatarURL) {
              profileImage = userData.cachedAvatarURL;
            } else {
              const initials = getInitials(displayName);
              const bgColor = colorFromName(displayName);
              const url = await uploadAvatarToCloudinary(initials, bgColor, poetUid);
              if (url) profileImage = url;
            }
          }
        } catch (err) {
          console.warn("Failed to fetch user info:", err);
        }
      }

      // --- Collaborators info for poem card ---
      let collaboratorsHTML = "";

      if (Array.isArray(poem.collaborators) && poem.collaborators.length > 0) {
        try {
          const collaboratorLinks = [];

          for (const collaborator of poem.collaborators) {
            if (!collaborator.uid) continue;

            let collabName = collaborator.username || "Unknown";
            let collabLink = "#";

            const collabDoc = await getDoc(doc(db, "users", collaborator.uid));
            if (collabDoc.exists()) {
              const collabData = collabDoc.data();
              collabName = collabData.username || collabName;
              collabLink = `/user-profile.html?uid=${encodeURIComponent(collaborator.uid)}`;
            }

            collaboratorLinks.push(
              `<a href="${collabLink}" class="collaborator-link">${collabName}</a>`
            );
          }

          if (collaboratorLinks.length) {
            collaboratorsHTML = `
              <div class="collaborator-line"
                   style="margin-top:4px; font-size:0.95rem; color:#555;">
                <em>Co-written with ${collaboratorLinks.join(", ")}</em>
              </div>
            `;
          }
        } catch (err) {
          console.warn("Failed to fetch collaborators:", err);
        }
      }

// --- AUDIO SECTION: Check if poem has audio URL ---
let audioHTML = '';
if (poem.audioUrl) {
  audioHTML = `
    <div class="poem-audio-section" style="margin: 15px 0 15px 0 !important; padding: 8px 12px !important; background: #f0ede8; border-radius: 12px; width: fit-content; max-width: 45%; min-width: 240px; clear: both;">
      <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;">
        <span style="font-size: 0.75rem; color: #4b2aad; font-weight: 600;">🎙️ Spoken Version</span>
      </div>
      <audio controls style="width: 100%; border-radius: 8px; height: 35px;" preload="metadata">
        <source src="${poem.audioUrl}" type="audio/mpeg">
        Your browser does not support the audio element.
      </audio>
    </div>
  `;
}

      // --- Render poem card ---
      card.innerHTML = `
        <div class="author-line"
             style="display:flex; align-items:center; gap:10px; margin-bottom:2px;">
          <img src="${profileImage}" alt="${displayName}" class="author-img"
               style="width:50px; height:50px; border-radius:50%; object-fit:cover;">
          <a href="${profileLink}" class="author-link"
             style="font-size:1.2rem; font-weight:700;">
            ${displayName}
          </a>
        </div>

        ${collaboratorsHTML}

        <h3 class="recent-poem-title" style="margin-top:12px;">
          ${poem.title || "Untitled"}
        </h3>

        <p class="poem-content" style="white-space:pre-wrap; margin-top:8px; margin-left:0; padding-left:0;">${truncated.preview.trim()}</p>

        ${truncated.truncated ? `<button class="read-more-btn">Read More</button>` : ""}

        ${audioHTML}

        ${poem.categories?.length
          ? `<p class="poem-category-line"><em>${
              poem.categories.map(cat => 
                `<a href="category.html?name=${encodeURIComponent(cat)}" class="category-link">${cat}</a>`
              ).join(", ")
            }</em></p>`
          : ""
        }

        <div class="poem-actions">
          <div class="comment-section">
            <textarea class="comment-input" placeholder="Write a comment..." rows="1"></textarea>
            <button class="comment-btn">Post</button>
          </div>
          <button class="like-btn">❤️</button>
          <span class="like-count">${likes}</span>
          <span class="message-count">💬</span>
        </div>
      `;

      container.appendChild(card);

      // Add comment list as a sibling AFTER the card
      const commentListDiv = document.createElement("div");
      commentListDiv.className = "comment-list";
      commentListDiv.style.display = "none";
      container.appendChild(commentListDiv);

      // Read More toggle
      if (truncated.truncated) {
        const btn = card.querySelector(".read-more-btn");
        const p = card.querySelector(".poem-content");
        btn.addEventListener("click", () => {
          if (btn.textContent === "Read More") {
            p.textContent = truncated.full;
            btn.textContent = "Show Less";
          } else {
            p.textContent = truncated.preview;
            btn.textContent = "Read More";
          }
        });
      }

      // Count comments
      const commentsCol = collection(db, "recentPoems", docId, "comments");
      const commentsSnapshot = await getDocs(commentsCol);
      card.querySelector(".message-count").textContent = `💬 ${commentsSnapshot.size}`;

      // Auto-resize comment box
      const textarea = card.querySelector(".comment-input");
      textarea.addEventListener("input", () => {
        textarea.style.height = "auto";
        textarea.style.height = textarea.scrollHeight + "px";
      });
    }

    currentIndex = end;
    if (currentIndex >= allPoemsCache.length) reachedEnd = true;
    loading = false;
    
    // If first load and no poems, show message
    if (container.children.length === 0 && allPoemsCache.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:60px 20px; color:#7a6a5a;">Fetching poems...</div>';
    }
  } catch (err) {
    console.error("Error fetching poems:", err);
    loading = false;
  }
}

// Helper function to get comment list (next sibling of card)
function getCommentList(card) {
  if (!card) return null;
  const nextSibling = card.nextElementSibling;
  if (nextSibling && nextSibling.classList.contains("comment-list")) return nextSibling;
  return null;
}

// Load first batch
window.addEventListener("DOMContentLoaded", () => {
  loadPoemsBatch();
});

// Infinite scroll listener
window.addEventListener("scroll", () => {
  if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 200) {
    loadPoemsBatch();
  }
});

// --- Offline Notice ---
function setupOfflineNotice() {
  window.addEventListener("offline", () => {
    const notice = document.createElement("div");
    notice.textContent = "⚠ You are offline. Viewing cached content.";
    notice.className = "offline-notice";
    document.body.prepend(notice);
  });
  window.addEventListener("online", () => {
    document.querySelectorAll(".offline-notice").forEach(el => el.remove());
  });
}

// --- Auth Navbar ---
onAuthStateChanged(auth, async (user) => {
  const profileLink = document.getElementById("profile-link");
  let userDisplay = document.getElementById("user-display");
  if (!userDisplay) {
    userDisplay = document.createElement("div");
    userDisplay.id = "user-display";
    userDisplay.className = "user-dropdown";
    if (profileLink && profileLink.parentNode) {
      profileLink.parentNode.insertBefore(userDisplay, profileLink);
      profileLink.style.display = "none";
    }
  }

  if (user) {
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);
    let username = user.email;
    if (docSnap.exists()) username = docSnap.data().username || user.email;
    if (userDisplay) {
      userDisplay.innerHTML = `
        <span class="username"> ${username}</span>
        <div class="dropdown-content">
          <a href="#" id="logout-link">Logout</a>
        </div>
      `;
    }
    const logoutLink = document.getElementById("logout-link");
    if (logoutLink) {
      logoutLink.onclick = async (e) => {
        e.preventDefault();
        await signOut(auth);
        window.location.reload();
      };
    }
  } else {
    if (profileLink) profileLink.style.display = "inline-block";
    if (userDisplay) userDisplay.remove();
  }
});

// --- Like / Comment Handler ---
document.addEventListener("click", async (e) => {
  const user = auth.currentUser;

  // LIKE / UNLIKE
  if (e.target.classList.contains("like-btn")) {
    if (!user) { 
      redirectToLogin();
      return; 
    }
    const card = e.target.closest(".recent-poem-card");
    const docId = card.dataset.id;
    const countSpan = card.querySelector(".like-count");
    const poemRef = doc(db, "recentPoems", docId);

    try {
      const docSnap = await getDoc(poemRef);
      if (!docSnap.exists()) return;
      const data = docSnap.data();
      const likedBy = Array.isArray(data.likedBy) ? data.likedBy : [];
      let likes = typeof data.likes === "number" ? data.likes : 0;

      if (likedBy.includes(user.uid)) {
        if (likes > 0) await updateDoc(poemRef, { likes: increment(-1), likedBy: likedBy.filter(uid => uid !== user.uid) });
        countSpan.textContent = likes - 1;
        e.target.classList.remove("liked");
      } else {
        await updateDoc(poemRef, { likes: increment(1), likedBy: arrayUnion(user.uid) });
        countSpan.textContent = likes + 1;
        e.target.classList.add("liked");
      }
    } catch (err) { console.error("Error updating like:", err); }
  }

  // COMMENT POST
  if (e.target.classList.contains("comment-btn")) {
    if (!user) { 
      redirectToLogin();
      return; 
    }

    const card = e.target.closest(".recent-poem-card");
    const docId = card.dataset.id;
    const input = card.querySelector(".comment-input");
    const commentList = getCommentList(card);
    const text = input.value.trim();
    if (!text) return;

    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      let username = "Anonymous";
      if (userDoc.exists()) username = userDoc.data().username || user.email;

      await addDoc(collection(db, "recentPoems", docId, "comments"), {
        userId: user.uid,
        username: username,
        text,
        timestamp: new Date()
      });

      const div = document.createElement("div");
      div.className = "comment";
      div.style.cssText = "background:#f0f0f0; padding:8px 12px; margin:6px 0; border-radius:6px;";

      div.innerHTML = `
        <a href="user-profile.html?uid=${encodeURIComponent(user.uid)}" 
           class="comment-author-link">${escapeHtml(username)}</a>: ${escapeHtml(text)}
      `;

      if (commentList) commentList.prepend(div);

      input.value = "";
      input.style.height = "auto";

      const commentsSnapshot = await getDocs(collection(db, "recentPoems", docId, "comments"));
      const commentCount = commentsSnapshot.size;
      card.querySelector(".message-count").textContent = `💬 ${commentCount}`;

      const poemRef = doc(db, "recentPoems", docId);
      const poemSnap = await getDoc(poemRef);

      if (poemSnap.exists()) {
        const poemData = poemSnap.data();
        const poemOwnerId = poemData.userId;

        if (poemOwnerId && poemOwnerId !== user.uid) {
          await addDoc(collection(db, "notifications"), {
            forUser: poemOwnerId,
            fromUser: user.uid,
            type: "comment",
            poemId: docId,
            text: text,
            timestamp: new Date(),
            read: false
          });
        }
      }

    } catch (err) {
      console.error("Error posting comment:", err);
    }
  }
  // SHOW COMMENTS
if (e.target.classList.contains("message-count")) {
  const card = e.target.closest(".recent-poem-card");
  const docId = card.dataset.id;
  const commentList = getCommentList(card);

  if (!commentList) return;
  const isVisible = commentList.style.display === "block";
  commentList.style.display = isVisible ? "none" : "block";
  if (isVisible) return;

  commentList.innerHTML = "<p style='color:#888;'>Loading comments...</p>";

  try {
    const commentsCol = collection(db, "recentPoems", docId, "comments");
    const commentsSnapshot = await getDocs(query(commentsCol, orderBy("timestamp", "asc")));
    commentList.innerHTML = "";

    if (commentsSnapshot.empty) {
      commentList.innerHTML = "<p style='color:#888;'>No comments yet. Be the first!</p>";
      return;
    }

    for (const docSnap of commentsSnapshot.docs) {
      const comment = docSnap.data();
      const div = document.createElement("div");
      div.className = "comment";
      div.dataset.commentId = docSnap.id;
      div.dataset.userId = comment.userId || "";
      div.style.cssText = "background:#fff; padding:8px 12px; margin:6px 0; border-radius:6px;";

      // Make username clickable (original comment - Purple color)
      const usernameLink = comment.userId 
        ? `<a href="/user-profile.html?uid=${encodeURIComponent(comment.userId)}" 
             style="font-weight:600; color:#5a3cb3; text-decoration:none; cursor:pointer;"
             onmouseover="this.style.textDecoration='underline'"
             onmouseout="this.style.textDecoration='none'">
             ${escapeHtml(comment.username || "Anonymous")}
           </a>`
        : `<span style="font-weight:600; color:#5a3cb3;">${escapeHtml(comment.username || "Anonymous")}</span>`;

      div.innerHTML = `
        ${usernameLink}: ${escapeHtml(comment.text)}
        <div><small class="reply-toggle" style="color:#5a3cb3; cursor:pointer;">Reply</small></div>
        <div class="reply-section" style="margin-left:20px; margin-top:5px;"></div>
      `;
      commentList.appendChild(div);

      // Load existing replies for this comment
      try {
        const repliesCol = collection(db, "recentPoems", docId, "comments", docSnap.id, "replies");
        const repliesSnapshot = await getDocs(repliesCol);
        if (!repliesSnapshot.empty) {
          const replySection = div.querySelector(".reply-section");
          repliesSnapshot.forEach(r => {
            const reply = r.data();
            // Make reply usernames clickable with color #B8860B (Dark Goldenrod)
            const replyUsernameLink = reply.userId
              ? `<a href="/user-profile.html?uid=${encodeURIComponent(reply.userId)}"
                   style="font-weight:600; color:#B8860B; text-decoration:none; cursor:pointer;"
                   onmouseover="this.style.textDecoration='underline'"
                   onmouseout="this.style.textDecoration='none'">
                   ${escapeHtml(reply.username)}
                 </a>`
              : `<span style="font-weight:600; color:#B8860B;">${escapeHtml(reply.username)}</span>`;
            
            replySection.innerHTML += `
              <div style="background:#f7f7f7; padding:6px 10px; border-radius:6px; margin:4px 0;">
                ${replyUsernameLink}: ${escapeHtml(reply.text)}
              </div>
            `;
          });
        }
      } catch (replyErr) {
        console.error("Error loading replies:", replyErr);
      }
    }
  } catch (err) {
    console.error("Error loading comments:", err);
    commentList.innerHTML = "<p style='color:red;'>Error loading comments.</p>";
  }
}

// REPLY TOGGLE
if (e.target.classList.contains("reply-toggle")) {
  const commentDiv = e.target.closest(".comment");
  const replySection = commentDiv.querySelector(".reply-section");

  const existing = replySection.querySelector(".reply-input");
  if (existing) {
    existing.remove();
    return;
  }

  const inputContainer = document.createElement("div");
  inputContainer.className = "reply-input";
  inputContainer.innerHTML = `
    <textarea placeholder="Write a reply..." rows="2" style="width:100%; padding:6px; border-radius:6px; border:1px solid #ccc;"></textarea>
    <button class="send-reply-btn" style="margin-top:4px; background:#5a3cb3; color:white; border:none; border-radius:6px; padding:4px 10px; cursor:pointer;">Send</button>
  `;
  replySection.appendChild(inputContainer);
}

// SEND REPLY
if (e.target.classList.contains("send-reply-btn")) {
  const user = auth.currentUser;
  if (!user) { alert("Please sign in to reply."); return; }

  const commentDiv = e.target.closest(".comment");
  const card = e.target.closest(".recent-poem-card");
  const docId = card.dataset.id;
  const commentId = commentDiv.dataset.commentId;
  const textarea = commentDiv.querySelector(".reply-input textarea");
  const replyText = textarea.value.trim();
  if (!replyText) return;

  const replySection = commentDiv.querySelector(".reply-section");

  try {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const username = userDoc.exists() ? userDoc.data().username || "User" : "User";

    await addDoc(collection(db, "recentPoems", docId, "comments", commentId, "replies"), {
      userId: user.uid,
      username,
      text: replyText,
      timestamp: new Date()
    });

    // Make reply username clickable with color #B8860B (Dark Goldenrod)
    const replyUsernameLink = `<a href="/user-profile.html?uid=${encodeURIComponent(user.uid)}"
                                 style="font-weight:600; color:#B8860B; text-decoration:none; cursor:pointer;"
                                 onmouseover="this.style.textDecoration='underline'"
                                 onmouseout="this.style.textDecoration='none'">
                                 ${escapeHtml(username)}
                               </a>`;

    const replyDiv = document.createElement("div");
    replyDiv.style.cssText = "background:#f0f0f0; padding:5px 10px; margin:5px 0; border-radius:6px;";
    replyDiv.innerHTML = `${replyUsernameLink}: ${escapeHtml(replyText)}`;
    replySection.insertBefore(replyDiv, replySection.querySelector(".reply-input"));
    textarea.value = "";
    const replyInput = replySection.querySelector(".reply-input");
    if (replyInput) replyInput.remove();
  } catch (err) {
    console.error("Error sending reply:", err);
    alert("Failed to send reply.");
  }
}
});
// --- DOM Initialization & Tabs ---
document.addEventListener("DOMContentLoaded", () => {
  setupOfflineNotice();

  // Fade-in animation on scroll
  const faders = document.querySelectorAll('.fade-in');
  window.addEventListener('scroll', () => {
    faders.forEach(fader => {
      const rect = fader.getBoundingClientRect();
      if (rect.top < window.innerHeight - 100) fader.classList.add('visible');
    });
  });

  // --- Tabs ---
  const tabBtns = document.querySelectorAll(".tab-btn");
  const tabContents = document.querySelectorAll(".tab-content");

  function activateTab(tabId) {
    tabBtns.forEach(b => b.classList.remove("active"));
    tabContents.forEach(c => c.classList.remove("active"));

    const activeBtn = document.querySelector(`.tab-btn[data-tab="${tabId}"]`);
    const activeContent = document.getElementById(tabId);
    if (activeBtn && activeContent) {
      activeBtn.classList.add("active");
      activeContent.classList.add("active");
      localStorage.setItem("activeTab", tabId);
    }
  }

  const lastTab = localStorage.getItem("activeTab");
  if (lastTab) activateTab(lastTab);
  else activateTab("recent");

  tabBtns.forEach(btn => {
    btn.addEventListener("click", () => activateTab(btn.dataset.tab));
  });
});

const usernameDisplay = document.getElementById("username-display");
const usernameDisplaySm = document.getElementById("username-display-sm");
const logoutBtn = document.getElementById("logout-btn");
const logoutBtnMobile = document.getElementById("logout-btn-mobile");
const loginLink = document.getElementById("login-link");

onAuthStateChanged(auth, async (user) => {
  if (!usernameDisplay || !usernameDisplaySm) return;

  if (user) {
    const userDoc = await getDoc(doc(db, "users", user.uid));
    const username = userDoc.exists() ? userDoc.data().username : "Anonymous";

    usernameDisplay.textContent = username;
    usernameDisplaySm.textContent = username;

    if (loginLink) loginLink.style.display = "none";
    updateMobileLogoutVisibility();

    if (logoutBtnMobile) {
      logoutBtnMobile.onclick = async () => {
        await signOut(auth);
        window.location.href = "users-login.html";
      };
    }

  } else {
    usernameDisplay.textContent = "";
    usernameDisplaySm.textContent = "";
    if (loginLink) loginLink.style.display = "inline-block";
    if (logoutBtn) logoutBtn.style.display = "none";
    if (logoutBtnMobile) logoutBtnMobile.style.display = "none";
  }
});

if (usernameDisplay) {
  usernameDisplay.addEventListener("click", () => {
    if (window.innerWidth > 768 && logoutBtn) {
      logoutBtn.style.display = logoutBtn.style.display === "inline-block" ? "none" : "inline-block";
    }
  });
}

if (logoutBtn) {
  logoutBtn.addEventListener("click", async () => {
    await signOut(auth);
    window.location.reload();
  });
}

window.addEventListener("resize", () => {
  updateMobileLogoutVisibility();
});

function updateMobileLogoutVisibility() {
  if (!logoutBtnMobile) return;
  if (window.innerWidth <= 768) {
    logoutBtnMobile.style.display = "inline-block";
  } else {
    logoutBtnMobile.style.display = "none";
  }
}

// --- UNIVERSAL SEARCH (filtered for Rence Blunt) ---
const universalSearchInput = document.getElementById("global-search-input");
const mobileSearchToggle = document.getElementById("search-toggle");
const mobileSearchDropdown = document.getElementById("search-dropdown");
const mobileSearchInput = document.getElementById("mobile-search-input");

if (mobileSearchToggle) {
  mobileSearchToggle.addEventListener("click", () => {
    mobileSearchDropdown.classList.toggle("show");
    if (mobileSearchDropdown.classList.contains("show") && mobileSearchInput) {
      mobileSearchInput.focus();
    }
  });

  document.addEventListener("click", (e) => {
    if (!mobileSearchDropdown.contains(e.target) && !mobileSearchToggle.contains(e.target)) {
      mobileSearchDropdown.classList.remove("show");
    }
  });
}

async function performSearch(query) {
  const q = query.trim().toLowerCase();

  const cards = document.querySelectorAll(".recent-poem-card");
  
  if (!q) {
    cards.forEach(card => card.style.display = "block");
    return;
  }

  cards.forEach(card => {
    const title = card.querySelector(".recent-poem-title")?.textContent.toLowerCase() || "";
    const content = card.querySelector(".poem-content")?.textContent.toLowerCase() || "";
    const visible = title.includes(q) || content.includes(q);
    card.style.display = visible ? "block" : "none";
  });
}

if (universalSearchInput) {
  universalSearchInput.addEventListener("input", async () => {
    await performSearch(universalSearchInput.value);
  });
}

if (mobileSearchInput) {
  mobileSearchInput.addEventListener("input", async () => {
    await performSearch(mobileSearchInput.value);
    if (universalSearchInput) universalSearchInput.value = mobileSearchInput.value;
  });
}

document.addEventListener("DOMContentLoaded", () => {
  const toggleBtn = document.getElementById("search-toggle");
  const dropdown = document.getElementById("search-dropdown");
  const mobileInput = document.getElementById("mobile-search-input");
  const desktopInput = document.getElementById("global-search-input");

  if (toggleBtn && dropdown) {
    toggleBtn.addEventListener("click", () => {
      dropdown.classList.toggle("show");
      if (dropdown.classList.contains("show") && mobileInput) {
        setTimeout(() => mobileInput.focus(), 200);
      }
    });

    if (mobileInput && desktopInput) {
      mobileInput.addEventListener("input", () => {
        desktopInput.value = mobileInput.value;
        desktopInput.dispatchEvent(new Event("input"));
      });
    }
  }
});

// --- DYNAMIC POETRY GALLERY (FILTERED for Rence Blunt) ---
async function loadPoetryGallery() {
  const galleryContainer = document.getElementById("poetry-gallery");
  const gallerySection = document.querySelector(".gallery-section");
  if (!galleryContainer || !gallerySection) return;

  gallerySection.style.display = "none";

  try {
    const recentSnap = await getDocs(collection(db, "recentPoems"));
    const recentPoems = [];
    
    for (const docSnap of recentSnap.docs) {
      const data = docSnap.data();
      if (isRenceBluntPoem(data)) {
        recentPoems.push({
          id: docSnap.id,
          title: data.title || "Untitled",
          content: data.content || "",
          author: "Rence Blunt",
          slug: data.slug || (data.title ? data.title.toLowerCase().replace(/\s+/g, "-") : docSnap.id),
          collection: "recentPoems",
        });
      }
    }

    const classicSnap = await getDocs(collection(db, "classicPoems"));
    const classicPoems = [];
    
    for (const docSnap of classicSnap.docs) {
      const data = docSnap.data();
      if (isRenceBluntPoem(data)) {
        classicPoems.push({
          id: docSnap.id,
          title: data.title || "Untitled",
          content: data.content || "",
          author: "Rence Blunt",
          slug: data.slug || (data.title ? data.title.toLowerCase().replace(/\s+/g, "-") : docSnap.id),
          collection: "classicPoems",
        });
      }
    }

    const randomRecent = recentPoems.sort(() => 0.5 - Math.random()).slice(0, 3);
    const randomClassic = classicPoems.sort(() => 0.5 - Math.random()).slice(0, 2);
    const allPoems = [...randomRecent, ...randomClassic];

    if (allPoems.length === 0) {
      galleryContainer.innerHTML = `<p style="text-align:center; padding:40px;">Gallery poems coming soon.</p>`;
      gallerySection.style.display = "block";
      return;
    }

    const html = allPoems.map((p, index) => {
      const lines = (p.content || "").split(/\r?\n/);
      const preview = lines.slice(0, 6).join("\n");
      const url = `poem.html?collection=${p.collection}&slug=${encodeURIComponent(p.slug)}`;
      const visibilityClass = index >= 3 ? "classic" : "recent";

      return `
        <div class="gallery-item fade-in ${visibilityClass}">
          <div class="gallery-overlay">
            <h3>${escapeHtml(p.title)}</h3>
            <p style="white-space: pre-line;">${escapeHtml(preview)}${lines.length > 6 ? "..." : ""}</p>
            <span class="author">By ${escapeHtml(p.author)}</span>
            <a href="${url}" class="view-poem-btn"
              style="text-decoration:none; display:inline-block; margin-top:10px; padding:6px 12px; background:#4b2aad; color:#fff; border-radius:8px;">
              View Poem
            </a>
          </div>
        </div>
      `;
    }).join("");

    galleryContainer.innerHTML = html;
    animateGalleryItems();
    gallerySection.style.display = "block";

  } catch (err) {
    console.error("Error loading gallery:", err);
    galleryContainer.innerHTML = `<p>Failed to load poems.</p>`;
    gallerySection.style.display = "block";
  }
}

function animateGalleryItems() {
  document.querySelectorAll(".fade-in").forEach((item, i) => {
    item.style.opacity = "0";
    item.style.transform = "translateY(20px)";
    setTimeout(() => {
      item.style.transition = "all 0.8s ease";
      item.style.opacity = "1";
      item.style.transform = "translateY(0)";
    }, i * 200);
  });
}

// --- Load Categories (FILTERED for Rence Blunt) ---
async function loadAllCategories() {
  const section = document.getElementById("poem-categories-container");
  const container = document.getElementById("poem-categories");
  if (!container || !section) return;

  try {
    const snapshot = await getDocs(collection(db, "recentPoems"));
    const categoriesSet = new Set();

    snapshot.forEach((doc) => {
      const data = doc.data();
      if (isRenceBluntPoem(data) && Array.isArray(data.categories)) {
        data.categories.forEach((cat) => {
          if (cat && cat.trim() !== "") categoriesSet.add(cat.trim());
        });
      }
    });

    const categories = Array.from(categoriesSet).sort((a, b) =>
      a.localeCompare(b, "en", { sensitivity: "base" })
    );

    if (categories.length === 0) return;

    const limitedCategories = categories.slice(0, 38);
    const categoriesHTML = limitedCategories
      .map(
        (cat) => `
        <a href="category.html?name=${encodeURIComponent(cat)}" class="category-card">
          ${escapeHtml(cat)}
        </a>`
      )
      .join("");

    const allCategoriesLink = `
      <a href="all-categories.html" class="category-card all-categories">
        All Categories →
      </a>
    `;

    container.innerHTML = `
      <div class="categories-grid">
        ${categoriesHTML}
        ${allCategoriesLink}
      </div>
    `;

    section.style.display = "block";
    section.style.opacity = 0;
    setTimeout(() => {
      section.style.transition = "opacity 0.4s ease";
      section.style.opacity = 1;
    }, 50);
  } catch (error) {
    console.error("Error loading categories:", error);
  }
}

// Load all Rence Blunt specific content
document.addEventListener("DOMContentLoaded", () => {
  loadPoetryGallery();
  loadAllCategories();
});


// --- Load Ranking Poems (Top 20) using Recent Poems structure ---
async function loadRankingPoemsRich() {
  const container = document.getElementById("rank-poems");
  if (!container) return console.warn("No #rank-poems container found.");

  container.innerHTML = `
    <h3>Ranking Poems</h3>
    <p>Top 20 poems based on views, likes, and comments.</p>
    <div id="ranking-list"></div>
  `;
  const listEl = container.querySelector("#ranking-list");
  listEl.innerHTML = ""; // clear

  try {
    // fetch all poems
    const snapshot = await getDocs(collection(db, "recentPoems"));
    if (snapshot.empty) {
      listEl.innerHTML = "<p style='color:#666;'>No poems found.</p>";
      return;
    }

    // Build array with score, author info, collaborators
    const poems = await Promise.all(snapshot.docs.map(async docSnap => {
      const data = docSnap.data() || {};
      const views = typeof data.views === "number" ? data.views : 0;
      const likes = typeof data.likes === "number" ? data.likes : 0;
      const commentsStored = typeof data.comments === "number" ? data.comments : 0;

      // fetch real comment count
      let realComments = commentsStored;
      try {
        const commentSnap = await getDocs(collection(db, "recentPoems", docSnap.id, "comments"));
        realComments = commentSnap.size;
      } catch {}

      // calculate score
      const score = views + likes * 3 + realComments * 5;

      // resolve author info
      const poetUid = data.authorId || data.userId || "";
      let displayName = data.author || "Anonymous";
      let profileLink = "#";

      if (poetUid) {
        try {
          const userDoc = await getDoc(doc(db, "users", poetUid));
          if (userDoc.exists()) {
            displayName = userDoc.data().username || displayName;
            profileLink = `/user-profile.html?uid=${encodeURIComponent(poetUid)}`;
          }
        } catch (err) {
          console.warn("Failed to fetch author:", err);
        }
      }

      // properly handle collaborators (avoid undefined)
      const collaborators = Array.isArray(data.collaborators)
        ? data.collaborators.map(c => ({
            uid: c.uid || "#",
            username: c.username || "Anonymous"
          }))
        : [];

      return {
        id: docSnap.id,
        title: data.title || "Untitled",
        slug: data.slug || docSnap.id,
        authorId: poetUid,
        authorName: displayName,
        authorProfile: profileLink,
        content: data.content || "",
        likes,
        likedBy: Array.isArray(data.likedBy) ? data.likedBy : [],
        views,
        categories: Array.isArray(data.categories)
          ? data.categories
          : (data.categories ? [data.categories] : []),
        score,
        commentsCount: realComments,
        collaborators
      };
    }));

    // sort by score desc and take top 20
    poems.sort((a, b) => b.score - a.score);
    const top = poems.slice(0, 20);

    // Helper functions for avatar (if not defined globally)
    const getInitials = (name = "") => {
      const parts = name.trim().split(" ");
      if (parts.length === 1) return parts[0][0]?.toUpperCase() || "?";
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };

    const colorFromName = (name = "") => {
      let hash = 0;
      for (let i = 0; i < name.length; i++) {
        hash = name.charCodeAt(i) + ((hash << 5) - hash);
      }
      const hue = Math.abs(hash) % 360;
      return `hsl(${hue}, 60%, 45%)`;
    };

    // render each card
    for (let index = 0; index < top.length; index++) {
      const poem = top[index];
      const card = document.createElement("div");
      card.className = "recent-poem-card";
      card.dataset.id = poem.id;
      card.dataset.slug = poem.slug;

      const truncated = truncatePoem(poem.content, 8);
      const commentDisplayCount = poem.commentsCount;

      // fetch author profile image
      let profileImage = "/images/default-avatar.png";
      if (poem.authorId) {
        try {
          const userDoc = await getDoc(doc(db, "users", poem.authorId));
          if (userDoc.exists()) {
            const userData = userDoc.data();
            if (userData.photoURL) profileImage = userData.photoURL;
            else if (userData.cachedAvatarURL) profileImage = userData.cachedAvatarURL;
            else {
              const initials = getInitials(poem.authorName);
              const bgColor = colorFromName(poem.authorName);
              // uploadAvatarToCloudinary should be defined globally
              if (typeof uploadAvatarToCloudinary === 'function') {
                uploadAvatarToCloudinary(initials, bgColor, poem.authorId)
                  .then(url => {
                    if (url && card.querySelector(".author-img")) card.querySelector(".author-img").src = url;
                  });
              }
            }
          }
        } catch (err) {
          console.warn("Failed to fetch author profile image:", err);
        }
      }

      // build card HTML with collaborator links
      card.innerHTML = `
        <div class="author-line" style="display:flex; align-items:center; gap:8px; margin-bottom:2px;">
          <img src="${profileImage}" alt="${poem.authorName}" class="author-img" 
               style="width:48px; height:48px; border-radius:50%; object-fit:cover;">
          <a href="${poem.authorProfile}" class="author-link" 
             style="font-size:1.2rem; font-weight:700;">${escapeHtml(poem.authorName)}</a>
        </div>

        ${poem.collaborators.length ? `
          <p class="collaborators" style="margin-top:-2px; margin-left:56px;">
            Co-written with: ${poem.collaborators.map(c => 
              `<a href="/user-profile.html?uid=${encodeURIComponent(c.uid)}">${escapeHtml(c.username)}</a>`
            ).join(", ")}
          </p>
        ` : ""}

        <h3 class="recent-poem-title" style="margin-top:16px;">
          ${index + 1}. ${escapeHtml(poem.title)}
          <small style="font-weight:400; color:#777;">(score: ${poem.score})</small>
        </h3>

        <p class="poem-content" style="white-space:pre-wrap;">${truncated.preview}</p>
        ${truncated.truncated ? `<button class="read-more-btn">Read More</button>` : ""}
        ${poem.categories.length ? `<p class="poem-category-line"><em>${poem.categories.map(c => escapeHtml(c)).join(", ")}</em></p>` : ""}
        <div class="poem-actions">
          <div class="comment-section">
            <textarea class="comment-input" placeholder="Write a comment..." rows="1"></textarea>
            <button class="comment-btn">Post</button>
          </div>
          <button class="like-btn">❤️</button>
          <span class="like-count">${poem.likes}</span>
          <span class="message-count">💬 ${commentDisplayCount}</span>
        </div>
        <div class="comment-list" style="display:none;"></div>
      `;

      // border for top 3
      if (index === 0) card.style.border = "2px solid gold";
      else if (index === 1) card.style.border = "2px solid silver";
      else if (index === 2) card.style.border = "2px solid #cd7f32";
      else card.style.border = "1px solid #eee";

      // Append card ONCE (removed duplicate)
      listEl.appendChild(card);

      // mark liked by current user
      const user = auth.currentUser;
      if (user && Array.isArray(poem.likedBy) && poem.likedBy.includes(user.uid)) {
        const btn = card.querySelector(".like-btn");
        if (btn) btn.classList.add("liked");
      }

      // read more / show less
      if (truncated.truncated) {
        const btn = card.querySelector(".read-more-btn");
        const p = card.querySelector(".poem-content");
        let expanded = false;
        btn.addEventListener("click", () => {
          if (!expanded) {
            p.textContent = truncated.full;
            btn.textContent = "Show Less";
          } else {
            p.textContent = truncated.preview;
            btn.textContent = "Read More";
          }
          expanded = !expanded;
        });
      }
    }

    if (!listEl.children.length) {
      listEl.innerHTML = "<p style='color:#666;'>No poems to display.</p>";
    }

  } catch (err) {
    console.error("Error loading ranking poems:", err);
    listEl.innerHTML = `<p style="color:red;">Failed to load ranking poems: ${err.message}</p>`;
  }
}
// Only load ranking features if the containers exist on the page
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("rank-poems")) {
    loadRankingPoemsRich();
  }
});





// --- Load Ranking Poets ---
async function loadRankingPoets() {
  try {
    const container = document.getElementById("ranking-poets-container");
    if (!container) {
      console.warn("Ranking poets container not found!");
      return;
    }

    const poetsMap = {}; // { uniqueUsername: { username, poemsWritten, likesReceived, commentsReceived, likesGiven, commentsGiven, score } }

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const poemsSnapshot = await getDocs(collection(db, "recentPoems"));
    const usersSnapshot = await getDocs(collection(db, "users"));

    // Initialize poets from users collection
    usersSnapshot.forEach(userDoc => {
      const data = userDoc.data();
      const username = data.username || "Anonymous";
      poetsMap[username] = {
        userId: userDoc.id,
        username,
        poemsWritten: 0,
        likesReceived: 0,
        commentsReceived: 0,
        likesGiven: 0,
        commentsGiven: 0,
        score: 0
      };
    });

    // Count activity in the past week
    poemsSnapshot.forEach(docSnap => {
      const data = docSnap.data();

      // Normalize a unique key using userId or username
      const username = data.username || data.submittedBy || data.author || "Anonymous";

      if (!poetsMap[username]) {
        poetsMap[username] = {
          userId: data.userId || null,
          username,
          poemsWritten: 0,
          likesReceived: 0,
          commentsReceived: 0,
          likesGiven: 0,
          commentsGiven: 0,
          score: 0
        };
      }

      const createdAt = data.timestamp ? data.timestamp.toDate() : new Date();
      if (createdAt >= weekAgo) {
        poetsMap[username].poemsWritten += 1;
        poetsMap[username].likesReceived += data.likes || 0;
        poetsMap[username].commentsReceived += data.comments?.length || 0;
      }

      // Likes given
      if (data.likedBy && Array.isArray(data.likedBy)) {
        data.likedBy.forEach(uid => {
          // Map UID to username if exists
          const user = usersSnapshot.docs.find(u => u.id === uid);
          const likerName = user ? user.data().username : "Anonymous";

          if (!poetsMap[likerName]) {
            poetsMap[likerName] = {
              userId: uid,
              username: likerName,
              poemsWritten: 0,
              likesReceived: 0,
              commentsReceived: 0,
              likesGiven: 0,
              commentsGiven: 0,
              score: 0
            };
          }
          poetsMap[likerName].likesGiven += 1;
        });
      }

      // Comments given
      if (data.comments && Array.isArray(data.comments)) {
        data.comments.forEach(comment => {
          const commenterName = comment.user || comment.userId || "Anonymous";

          if (!poetsMap[commenterName]) {
            poetsMap[commenterName] = {
              userId: comment.userId || null,
              username: commenterName,
              poemsWritten: 0,
              likesReceived: 0,
              commentsReceived: 0,
              likesGiven: 0,
              commentsGiven: 0,
              score: 0
            };
          }
          poetsMap[commenterName].commentsGiven += 1;
        });
      }
    });

    // Calculate score
    Object.values(poetsMap).forEach(poet => {
      poet.score = poet.poemsWritten * 5 +
                   poet.likesReceived * 3 +
                   poet.commentsReceived * 2 +
                   poet.likesGiven +
                   poet.commentsGiven;
    });

    // Sort and take top 20
    const sortedPoets = Object.values(poetsMap)
      .filter(poet => poet.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 20);

    // Render
container.innerHTML = "";
sortedPoets.forEach((poet, index) => {
  const poetDiv = document.createElement("div");
  poetDiv.className = "ranking-poet-card";

  // Determine badge
  let badge = "";
  if (index === 0) badge = "🏆";
  else if (index === 1) badge = "🥈";
  else if (index === 2) badge = "🥉";

  // Fetch profile image (reuse your Cloudinary logic)
  let profileImage = "/images/default-avatar.png";
  if (poet.userId) {
    try {
      const userDoc = usersSnapshot.docs.find(u => u.id === poet.userId);
      if (userDoc) {
        const userData = userDoc.data();
        if (userData.photoURL) profileImage = userData.photoURL;
        else if (userData.cachedAvatarURL) profileImage = userData.cachedAvatarURL;
        else {
          const initials = getInitials(poet.username);
          const bgColor = colorFromName(poet.username);
          uploadAvatarToCloudinary(initials, bgColor, poet.userId)
            .then(url => {
              if (url) poetDiv.querySelector("img").src = url;
            });
        }
      }
    } catch (err) {
      console.warn("Failed to fetch poet profile image:", err);
    }
  }

  poetDiv.innerHTML = `
    <div class="poet-card-header">
      <div class="poet-rank-badge">${badge}</div>
      <img src="${profileImage}" alt="${poet.username}" class="poet-avatar">
      <div class="poet-info">
        <a href="user-profile.html?uid=${encodeURIComponent(poet.userId || "")}" class="poet-username">${poet.username}</a>
        <p class="poet-activity">
          ${poet.poemsWritten} poems · ${poet.likesReceived} likes · ${poet.commentsReceived} comments · ${poet.likesGiven} likes given · ${poet.commentsGiven} comments given
        </p>
      </div>
    </div>
  `;
  container.appendChild(poetDiv);
});

  } catch (err) {
    console.error("Error loading ranking poets:", err);
  }
}

// Load when page is ready
// Only load ranking features if the containers exist on the page
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("ranking-poets-container")) {
    loadRankingPoets();
  }
});

// Load weekly highlights on all pages (for quote and poem pages)
document.addEventListener("DOMContentLoaded", () => {
  loadWeeklyHighlights();
});