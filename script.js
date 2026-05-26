import { 
  initializeApp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import { 
  getFirestore, collection, query, orderBy, limit, getDocs, doc, getDoc, 
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

// Enable offline persistence
enableIndexedDbPersistence(db).catch(err => {
  if (err.code === 'failed-precondition') {
    console.warn("Persistence failed: multiple tabs open");
  } else if (err.code === 'unimplemented') {
    console.warn("Persistence not supported in this browser");
  }
});

// Track pagination
let lastVisible = null;
let reachedEnd = false;

// --- Structured Data Injection for SEO ---
function addPoemSchema(poem) {
  // Remove previous JSON-LD (avoid duplicates)
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

// Load weekly highlights
async function loadWeeklyHighlights() {
  try {
    // --- Quote of the Week ---
    const quoteSnap = await getDoc(doc(db, "weeklyHighlights", "weeklyQuote"));
    if (quoteSnap.exists()) {
      const data = quoteSnap.data();

      // Preserve line breaks
      const quoteHTML = data.quote.replace(/\n/g, "<br>");
      document.getElementById("weekly-quote").innerHTML = `<em>“${quoteHTML}”</em>`;
      document.getElementById("quote-author").innerHTML = data.author 
        ? `<br>~ ${data.author}` 
        : "";
    }

    // --- Poem of the Week ---
    const poemSnap = await getDoc(doc(db, "weeklyHighlights", "weeklyPoem"));
    if (poemSnap.exists()) {
      const data = poemSnap.data();

      // ✅ Grab poem parts
      const title = data.title || "Untitled"; // fallback if no title
      const author = data.author || "";
      const content = data.content || "";

      // Split poem into lines
      const lines = content.split("\n");
      const firstPart = lines.slice(0, 8).join("<br>");
      const restPart = lines.slice(8).join("<br>");

      const poemContainer = document.getElementById("weekly-poem");
      const poemAuthor = document.getElementById("poem-author");
      const poemTitle = document.getElementById("poem-title"); // 🎯 title container

      // ✅ Show title
      poemTitle.innerHTML = `<h3 class="poem-title">${title}</h3>`;

      // ✅ Insert poem text + toggle
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

      // ✅ Show author with full-width separator above
      poemAuthor.innerHTML = author 
        ? `<hr class="poem-separator"><div class="poem-author">~ ${author}</div>` 
        : "";

      // Scoped toggle only for this poem container
      if (lines.length > 8) {
        const wrapper = document.getElementById(wrapperId);
        const toggleBtn = wrapper.querySelector(".toggle-poem");
        const moreLines = wrapper.querySelector(".more-lines");

        toggleBtn.addEventListener("click", () => {
          const isHidden = moreLines.style.display === "none";
          moreLines.style.display = isHidden ? "inline" : "none";
          toggleBtn.textContent = isHidden ? "Read less" : "Read more";
        });
      }
    }
  } catch (err) {
    console.error("Error fetching weekly highlights:", err);
  }
}

// Helper: truncate poem content
function truncatePoem(text, lines = 8) {
  const allLines = text.split(/\r?\n/);
  if (allLines.length <= lines) return { preview: text, full: text, truncated: false };
  return {
    preview: allLines.slice(0, lines).join("\n"),
    full: text,
    truncated: true
  };
}

// Load poems with pagination + likes/comments
async function loadRecentPoems(initial = false) {
  if (reachedEnd) return;

  try {
    const colRef = collection(db, "recentPoems");
    let q = query(colRef, orderBy("timestamp", "desc"), limit(10));

    if (lastVisible && !initial) {
      q = query(colRef, orderBy("timestamp", "desc"), startAfter(lastVisible), limit(10));
    }

    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      const loadMoreBtn = document.getElementById("load-more-poems");
      if (loadMoreBtn) loadMoreBtn.style.display = "none";
      reachedEnd = true;
      return;
    }

    const container = document.getElementById("recent-poems-container");
    if (initial) container.innerHTML = ""; // clear only first time

   snapshot.docs.forEach(async (docSnap) => {
  const poem = docSnap.data();
  const docId = docSnap.id;
  const card = document.createElement("div");
  card.className = "recent-poem-card";
  card.setAttribute("data-id", docId);

  const truncated = truncatePoem(poem.content, 8);
  const likes = typeof poem.likes === "number" ? poem.likes : 0;

card.innerHTML = `
  <h3 class="recent-poem-title">${poem.title}</h3>
  <p class="poem-content">${truncated.preview}</p>

  ${truncated.truncated ? `<button class="read-more-btn">Read More</button>` : ""}

  ${poem.categories && poem.categories.length > 0
    ? `<p class="poem-category-line"><em>${poem.categories.join(", ")}</em></p>`
    : ""
  }

  ${poem.author ? `<span class="author">– ${poem.author}</span>` : ""}

  <div class="poem-actions">
    <div class="comment-section">
      <textarea class="comment-input" placeholder="Write a comment..." rows="1"></textarea>
      <button class="comment-btn">Post</button>
    </div>
    <button class="like-btn">❤️</button>
    <span class="like-count">${likes}</span>
    <span class="message-count">💬 0</span>
  </div>

  <div class="comment-list" style="display:none;"></div>
`;


  container.appendChild(card);

  // 🔍 Add structured data for SEO
addPoemSchema({
  title: poem.title,
  description: poem.content ? poem.content.slice(0, 150) : "",
  slug: poem.slug || poem.title.toLowerCase().replace(/\s+/g, "-"),
  date: poem.timestamp ? new Date(poem.timestamp.seconds * 1000).toISOString().split("T")[0] : "",
});

  // --- Set like button active if user already liked ---
  const user = auth.currentUser;
  if (user) {
    const likedBy = Array.isArray(poem.likedBy) ? poem.likedBy : [];
    if (likedBy.includes(user.uid)) {
      card.querySelector(".like-btn").classList.add("liked");
    }
  }

  // Read more toggle
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

  // Fetch and display comment count
  const commentsCol = collection(db, "recentPoems", docId, "comments");
  const commentsSnapshot = await getDocs(commentsCol);
  const messageCount = card.querySelector(".message-count");
  messageCount.textContent = `💬 ${commentsSnapshot.size}`;

  // Setup dynamic textarea expansion
  const textarea = card.querySelector(".comment-input");
  textarea.addEventListener("input", () => {
    textarea.style.height = "auto";
    textarea.style.height = textarea.scrollHeight + "px";
  });
});


    lastVisible = snapshot.docs[snapshot.docs.length - 1];
    if (snapshot.size < 10) {
      const loadMoreBtn = document.getElementById("load-more-poems");
      if (loadMoreBtn) loadMoreBtn.style.display = "none";
      reachedEnd = true;
    }

  } catch (err) {
    console.error("Error fetching recent poems:", err);
  }
}

// Offline/online notice
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

// Navbar toggle
function setupNavbarToggle() {
  const toggle = document.getElementById("menu-toggle");
  const navLinks = document.getElementById("nav-links");

  if (toggle && navLinks) {
    toggle.addEventListener("click", () => {
      navLinks.classList.toggle("show");
    });

    const links = navLinks.querySelectorAll("a");
    links.forEach(link => {
      link.addEventListener("click", () => {
        navLinks.classList.remove("show");
      });
    });
  }
}

// Auth state changes (Navbar)
onAuthStateChanged(auth, async (user) => {
  const profileLink = document.getElementById("profile-link");
  let userDisplay = document.getElementById("user-display");
  if (!userDisplay) {
    userDisplay = document.createElement("div");
    userDisplay.id = "user-display";
    userDisplay.className = "user-dropdown";
    profileLink.parentNode.insertBefore(userDisplay, profileLink);
    profileLink.style.display = "none";
  }

  if (user) {
    const docRef = doc(db, "users", user.uid);
    const docSnap = await getDoc(docRef);
    let username = user.email;
    if (docSnap.exists()) username = docSnap.data().username || user.email;

    userDisplay.innerHTML = `
      <span class="username"> ${username}</span>
      <div class="dropdown-content">
        <a href="#" id="logout-link">Logout</a>
      </div>
    `;

    document.getElementById("logout-link").onclick = async (e) => {
      e.preventDefault();
      await signOut(auth);
      window.location.reload();
    };
  } else {
    profileLink.style.display = "inline-block";
    if (userDisplay) userDisplay.remove();
  }
});

// ---------- Like / Comment / Message Count Handler ----------
document.addEventListener("click", async (e) => {
  const user = auth.currentUser;

  // LIKE / UNLIKE
  if (e.target.classList.contains("like-btn")) {
    if (!user) { alert("Please sign in to like poems!"); return; }
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
        if (likes > 0) {
          await updateDoc(poemRef, {
            likes: increment(-1),
            likedBy: likedBy.filter(uid => uid !== user.uid)
          });
          likes -= 1;
        }
        countSpan.textContent = likes;
        e.target.classList.remove("liked");
      } else {
        await updateDoc(poemRef, {
          likes: increment(1),
          likedBy: arrayUnion(user.uid)
        });
        countSpan.textContent = likes + 1;
        e.target.classList.add("liked");
      }

    } catch (err) { console.error("Error updating like:", err); }
  }

  // COMMENT POST
// COMMENT POST
if (e.target.classList.contains("comment-btn")) {
  if (!user) { alert("Please sign in to comment!"); return; }
  const card = e.target.closest(".recent-poem-card");
  const docId = card.dataset.id;
  const input = card.querySelector(".comment-input");
  const commentList = card.querySelector(".comment-list");
  const text = input.value.trim();
  if (!text) return;

  try {
    await addDoc(collection(db, "recentPoems", docId, "comments"), {
      userId: user.uid,
      text,
      timestamp: new Date()
    });

    // Get username
    const userDoc = await getDoc(doc(db, "users", user.uid));
    let username = "Anonymous";
    if (userDoc.exists()) username = userDoc.data().username || user.email;

    // Show at top
    const div = document.createElement("div");
    div.className = "comment";
    div.style.background = "#f0f0f0";
    div.style.padding = "8px 12px";
    div.style.margin = "6px 0";
    div.style.borderRadius = "6px";
    div.textContent = `${username}: ${text}`;
    commentList.prepend(div);

    input.value = "";
    input.style.height = "auto";

    const commentsSnapshot = await getDocs(collection(db, "recentPoems", docId, "comments"));
    card.querySelector(".message-count").textContent = `💬 ${commentsSnapshot.size}`;

  } catch (err) { console.error("Error posting comment:", err); }
}

  // SHOW COMMENTS
  if (e.target.classList.contains("message-count")) {
    const card = e.target.closest(".recent-poem-card");
    const docId = card.dataset.id;
    const commentList = card.querySelector(".comment-list");

    if (commentList.style.display === "block") {
      commentList.style.display = "none";
      return;
    }

    commentList.innerHTML = ""; // clear previous
    const commentsCol = collection(db, "recentPoems", docId, "comments");
    const commentsSnapshot = await getDocs(query(commentsCol, orderBy("timestamp", "desc")));

    for (const docSnap of commentsSnapshot.docs) {
      const c = docSnap.data();
      let username = "Anonymous";
      if (c.userId) {
        const userDoc = await getDoc(doc(db, "users", c.userId));
        if (userDoc.exists()) username = userDoc.data().username || "Anonymous";
      }
      const div = document.createElement("div");
      div.className = "comment";
      div.style.background = "#f0f0f0";
      div.style.padding = "8px 12px";
      div.style.margin = "6px 0";
      div.style.borderRadius = "6px";
      div.textContent = `${username}: ${c.text}`;
      commentList.appendChild(div);
    }

    commentList.style.display = "block";
  }
});


// Initialize DOM
// --- 🔍 Combined Search: Local + Firestore (with in-place "Read More") ---
document.addEventListener("DOMContentLoaded", () => {
  loadWeeklyHighlights();
  loadRecentPoems(true);
  setupNavbarToggle();
  setupOfflineNotice();

  const loadMoreBtn = document.getElementById("load-more-poems");
  if (loadMoreBtn) loadMoreBtn.addEventListener("click", () => loadRecentPoems(false));

  const searchInput = document.getElementById("recent-poems-search");
  const container = document.getElementById("recent-poems-container");

  searchInput.addEventListener("input", async () => {
    const q = searchInput.value.trim().toLowerCase();

    // Remove Firestore results from previous search
    container.querySelectorAll(".firestore-result").forEach(e => e.remove());

    // If search is empty → show all local poems again
    if (!q) {
      container.querySelectorAll(".recent-poem-card").forEach(card => card.style.display = "block");
      return;
    }

    // 1️⃣ Filter locally loaded poems
    const localTitles = [];
    container.querySelectorAll(".recent-poem-card").forEach(card => {
      const title = card.querySelector("h3")?.textContent.toLowerCase() || "";
      const content = card.querySelector(".poem-content")?.textContent.toLowerCase() || "";
      const visible = title.includes(q) || content.includes(q);
      card.style.display = visible ? "block" : "none";
      if (visible) localTitles.push(title);
    });

    // 2️⃣ Fetch matches from Firestore too
    try {
      const snapshot = await getDocs(collection(db, "recentPoems"));
      const matches = [];

      snapshot.forEach(doc => {
        const data = doc.data();
        const title = (data.title || "").toLowerCase();
        const content = (data.content || "").toLowerCase();

        if ((title.includes(q) || content.includes(q)) && !localTitles.includes(title)) {
          matches.push({ id: doc.id, ...data });
        }
      });

      // 3️⃣ Add Firestore results below local ones
      matches.forEach(poem => {
        const card = document.createElement("div");
        card.className = "recent-poem-card firestore-result";

        const fullContent = (poem.content || "").replace(/\n/g, "<br>");
        const shortContent = fullContent.split("<br>").slice(0, 6).join("<br>");
        const hasMore = fullContent.split("<br>").length > 6;

        card.innerHTML = `
          <h3 class="recent-poem-title">${poem.title}</h3>
          <p class="poem-content">${hasMore ? shortContent + "..." : fullContent}</p>
          ${poem.categories ? `<p class="poem-category-line"><em>${poem.categories.join(", ")}</em></p>` : ""}
          ${poem.author ? `<span class="author">– ${poem.author}</span>` : ""}
          ${hasMore ? `<button class="read-more-btn">Read More</button>` : ""}
        `;

        // 🔽 Add expand/collapse behavior
        if (hasMore) {
          const btn = card.querySelector(".read-more-btn");
          const contentElem = card.querySelector(".poem-content");
          let expanded = false;

          btn.addEventListener("click", () => {
            expanded = !expanded;
            contentElem.innerHTML = expanded ? fullContent : shortContent + "...";
            btn.textContent = expanded ? "Show Less" : "Read More";
          });
        }

        container.appendChild(card);
      });
    } catch (err) {
      console.error("Error searching Firestore:", err);
    }
  });
});


// --- 🔢 Recent Poems Count ---
let allPoemsCache = [];

async function updateRecentPoemCount() {
  const titleEl = document.getElementById("recent-poems-title");
  if (titleEl) titleEl.textContent = `Recent Poems (${allPoemsCache.length})`;
}

async function fetchRecentPoemCount() {
  try {
    const snapshot = await getDocs(collection(db, "recentPoems"));
    allPoemsCache = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
    updateRecentPoemCount();
  } catch (err) {
    console.error("Error fetching poem count:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  fetchRecentPoemCount();
});

async function fetchCategories() {
  try {
    const snapshot = await getDocs(collection(db, "recentPoems"));
    const categorySet = new Set();

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.categories && Array.isArray(data.categories)) {
        data.categories.forEach(cat => categorySet.add(cat));
      }
    });

    const sortedCategories = Array.from(categorySet).sort((a, b) => a.localeCompare(b));
    const container = document.getElementById("poem-categories");
    container.innerHTML = "";

    // Limit to 23 categories before showing "All »"
    const limit = 23;
    sortedCategories.forEach((cat, index) => {
      if (index < limit) {
        const span = document.createElement("span");
        span.textContent = cat;
        span.className = "poem-category";
        
        // ✅ Make category clickable
        span.addEventListener("click", () => {
          window.location.href = `category.html?name=${encodeURIComponent(cat)}`;
        });

        container.appendChild(span);
      }
    });

    // Add "All »" link
    if (sortedCategories.length > limit) {
      const allSpan = document.createElement("span");
      allSpan.textContent = "All »";
      allSpan.className = "all-categories";

      allSpan.addEventListener("click", () => {
        window.location.href = "all-categories.html";
      });

      container.appendChild(allSpan);
    }

  } catch (err) {
    console.error("Error fetching categories: ", err);
  }
}

fetchCategories();


const faders = document.querySelectorAll('.fade-in');
window.addEventListener('scroll', () => {
  faders.forEach(fader => {
    const rect = fader.getBoundingClientRect();
    if (rect.top < window.innerHeight - 100) {
      fader.classList.add('visible');
    }
  });
});
