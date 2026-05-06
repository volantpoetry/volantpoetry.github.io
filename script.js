import { 
  initializeApp 
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import { 
  getFirestore, collection, query, orderBy, limit, getDocs, doc, getDoc, where,
  enableIndexedDbPersistence, startAfter, updateDoc, increment, addDoc, arrayUnion,
  writeBatch, serverTimestamp
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
// PERFECT READ COUNT TRACKING CONFIGURATION
// ============================================
const READ_TRACKING_KEY = 'poem_read_tracking';
const READ_TIMEOUT_MINUTES = 30;     // Don't count again for 30 minutes
const READ_DELAY_SECONDS = 8;         // 8 seconds - Perfect balance for genuine reads
const VIEW_THRESHOLD = 0.6;           // 60% of poem must be visible (not just a glimpse)

// Track active timers for each poem
const activeTimers = new Map();
const viewStartTimes = new Map();     // Track when user started viewing

// Get read tracking from sessionStorage
function getReadTracking() {
  const stored = sessionStorage.getItem(READ_TRACKING_KEY);
  if (!stored) return {};
  
  try {
    const tracking = JSON.parse(stored);
    const now = Date.now();
    const cleaned = {};
    for (const [poemId, timestamp] of Object.entries(tracking)) {
      if (now - timestamp < READ_TIMEOUT_MINUTES * 60 * 1000) {
        cleaned[poemId] = timestamp;
      }
    }
    return cleaned;
  } catch (e) {
    console.warn("Error parsing read tracking:", e);
    return {};
  }
}

// Save read tracking to sessionStorage
function saveReadTracking(tracking) {
  try {
    sessionStorage.setItem(READ_TRACKING_KEY, JSON.stringify(tracking));
  } catch (e) {
    console.warn("Error saving read tracking:", e);
  }
}

// Check if poem was recently read
function wasRecentlyRead(poemId) {
  const tracking = getReadTracking();
  const now = Date.now();
  return tracking[poemId] && (now - tracking[poemId] < READ_TIMEOUT_MINUTES * 60 * 1000);
}

// Actually record the view to Firebase
async function recordViewToFirebase(poemId) {
  // Double check before recording
  if (wasRecentlyRead(poemId)) {
    console.log(`⏭️ ${poemId} - Already counted recently, skipping duplicate`);
    return false;
  }
  
  try {
    const poemRef = doc(db, "recentPoems", poemId);
    await updateDoc(poemRef, {
      views: increment(1)
    });
    console.log(`✅ READ COUNTED: Poem ${poemId} after ${READ_DELAY_SECONDS} seconds of viewing (60% visible)`);
    
    // Update session storage
    const tracking = getReadTracking();
    tracking[poemId] = Date.now();
    saveReadTracking(tracking);
    
    // Update the view count on the card if it exists
    const card = document.querySelector(`.recent-poem-card[data-id="${poemId}"]`);
    if (card) {
      const viewCountSpan = card.querySelector('.view-count');
      if (viewCountSpan) {
        const currentText = viewCountSpan.textContent;
        const match = currentText.match(/\d+/);
        if (match) {
          const currentCount = parseInt(match[0]);
          const newCount = currentCount + 1;
          viewCountSpan.innerHTML = `👁️ ${newCount} ${newCount === 1 ? 'read' : 'reads'}`;
          
          // Add animation feedback
          viewCountSpan.style.transition = 'all 0.3s ease';
          viewCountSpan.style.color = '#4CAF50';
          viewCountSpan.style.transform = 'scale(1.1)';
          setTimeout(() => {
            viewCountSpan.style.color = '#888';
            viewCountSpan.style.transform = 'scale(1)';
          }, 1000);
        }
      }
    }
    
    return true;
  } catch (err) {
    console.warn(`Failed to record view for poem ${poemId}:`, err);
    return false;
  }
}

// Start tracking a poem when it becomes visible
function startTrackingPoem(poemId) {
  if (!poemId) return;
  
  // Check if already counted recently
  if (wasRecentlyRead(poemId)) {
    console.log(`⏭️ ${poemId} - Already counted in last ${READ_TIMEOUT_MINUTES} minutes`);
    return;
  }
  
  // Check if timer already exists
  if (activeTimers.has(poemId)) {
    console.log(`⏰ Timer already active for ${poemId}`);
    return;
  }
  
  // Record when user started viewing
  viewStartTimes.set(poemId, Date.now());
  
  console.log(`👀 User started viewing ${poemId} at ${new Date().toLocaleTimeString()}`);
  console.log(`⏳ Must view for ${READ_DELAY_SECONDS} seconds with 60% visibility to count as read`);
  
  // Set timer to record view after 8 seconds
  const timer = setTimeout(async () => {
    // Check if user actually viewed for full duration
    const viewDuration = Date.now() - (viewStartTimes.get(poemId) || Date.now());
    
    if (!wasRecentlyRead(poemId)) {
      if (viewDuration >= READ_DELAY_SECONDS * 1000) {
        console.log(`📊 User viewed ${poemId} for ${Math.round(viewDuration/1000)} seconds - COUNTING AS READ`);
        await recordViewToFirebase(poemId);
      } else {
        console.log(`⏭️ ${poemId} - Viewed only ${Math.round(viewDuration/1000)}s (need ${READ_DELAY_SECONDS}s) - NOT COUNTED`);
      }
    } else {
      console.log(`⏭️ ${poemId} - Was counted during timer, skipping`);
    }
    
    // Clean up
    activeTimers.delete(poemId);
    viewStartTimes.delete(poemId);
  }, READ_DELAY_SECONDS * 1000);
  
  activeTimers.set(poemId, timer);
}

// Stop tracking a poem (user scrolled away before required time)
function stopTrackingPoem(poemId) {
  if (!poemId) return;
  
  const timer = activeTimers.get(poemId);
  if (timer) {
    const viewDuration = Date.now() - (viewStartTimes.get(poemId) || Date.now());
    clearTimeout(timer);
    activeTimers.delete(poemId);
    viewStartTimes.delete(poemId);
    
    if (viewDuration < READ_DELAY_SECONDS * 1000) {
      console.log(`🛑 ${poemId} - User left after ${Math.round(viewDuration/1000)}s (less than ${READ_DELAY_SECONDS}s required) - NOT COUNTED`);
    }
  }
}

// Setup Intersection Observer for view tracking
function setupReadTracking() {
  if (!window.IntersectionObserver) {
    console.warn("IntersectionObserver not supported, read tracking disabled");
    return;
  }
  
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const card = entry.target;
      const poemId = card.dataset.id;
      
      if (!poemId) continue;
      
      // Poem is visible enough (60% or more in viewport)
      if (entry.isIntersecting && entry.intersectionRatio >= VIEW_THRESHOLD) {
        startTrackingPoem(poemId);
      } 
      // Poem is not visible enough (below 60%)
      else {
        stopTrackingPoem(poemId);
      }
    }
  }, {
    threshold: [0, VIEW_THRESHOLD], // Trigger at 0% and at 60%
    rootMargin: "0px"
  });
  
  // Observe existing and future poem cards
  function observePoemCards() {
    const cards = document.querySelectorAll('.recent-poem-card:not([data-read-tracked])');
    cards.forEach(card => {
      card.setAttribute('data-read-tracked', 'true');
      observer.observe(card);
    });
  }
  
  // Initial observation
  observePoemCards();
  
  // Watch for dynamically added cards (infinite scroll)
  const container = document.getElementById('recent-poems-container');
  if (container) {
    const mutationObserver = new MutationObserver(() => {
      observePoemCards();
    });
    mutationObserver.observe(container, { childList: true, subtree: false });
  }
  
  console.log(`✅ Read tracking initialized: ${READ_DELAY_SECONDS}s view required, ${READ_TIMEOUT_MINUTES}min cooldown, ${VIEW_THRESHOLD * 100}% visibility threshold`);
}

// Initialize tracking when page loads
document.addEventListener("DOMContentLoaded", () => {
  setupReadTracking();
});
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
        const authorName = data.author;
        const userUid = await getUidByUsername(authorName);
        const profileLink = userUid ? `/user-profile.html?uid=${encodeURIComponent(userUid)}` : "#";
        const authorLink = `<a href="${profileLink}" style="color: #B8860B; text-decoration:none; cursor:pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(authorName)}</a>`;
        authorElement.innerHTML = `<br>~ ${authorLink}`;
      } else if (authorElement) {
        authorElement.innerHTML = "";
      }
    }

    // Load Poem of the Week
    const poemContainer = document.getElementById("weekly-poem");
    const poemAuthor = document.getElementById("poem-author");
    const poemTitle = document.getElementById("poem-title");
    
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
          const userUid = await getUidByUsername(author);
          const profileLink = userUid ? `/user-profile.html?uid=${encodeURIComponent(userUid)}` : "#";
          const authorLink = `<a href="${profileLink}" style="color: #B8860B; text-decoration:none; cursor:pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(author)}</a>`;
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

// --- Recent Poems with Pagination ---
let loading = false;
const batchSize = 10;
let allPoemsCache = [];
let currentIndex = 0;
let currentUserId = null;
let followStates = new Map();

// Function to check if current user follows a poet
async function checkFollowStatus(poetId, currentUid) {
  if (!currentUid || !poetId || currentUid === poetId) return false;
  if (followStates.has(poetId)) return followStates.get(poetId);
  
  try {
    const docId = `${currentUid}_${poetId}`;
    const followRef = doc(db, "social", docId);
    const docSnap = await getDoc(followRef);
    const isFollowing = docSnap.exists();
    followStates.set(poetId, isFollowing);
    return isFollowing;
  } catch (err) {
    console.warn("Error checking follow status:", err);
    return false;
  }
}

// Function to handle follow/unfollow
async function handleFollowFromPoem(poetId, buttonElement) {
  if (!currentUserId || !poetId || currentUserId === poetId) return;
  
  try {
    const docId = `${currentUserId}_${poetId}`;
    const followRef = doc(db, "social", docId);
    const docSnap = await getDoc(followRef);
    const batch = writeBatch(db);
    
    if (docSnap.exists()) {
      batch.delete(followRef);
      batch.update(doc(db, "users", poetId), { followerCount: increment(-1) });
      batch.update(doc(db, "users", currentUserId), { followingCount: increment(-1) });
      await batch.commit();
      followStates.set(poetId, false);
      buttonElement.textContent = "Follow";
      buttonElement.classList.remove("following");
      buttonElement.style.background = "#4CAF50";
    } else {
      batch.set(followRef, { followerId: currentUserId, followedId: poetId, createdAt: serverTimestamp() });
      batch.update(doc(db, "users", poetId), { followerCount: increment(1) });
      batch.update(doc(db, "users", currentUserId), { followingCount: increment(1) });
      await batch.commit();
      followStates.set(poetId, true);
      buttonElement.textContent = "Following";
      buttonElement.classList.add("following");
      buttonElement.style.background = "#f44336";
    }
  } catch (err) {
    console.error("Error handling follow:", err);
  }
}

// Setup Intersection Observer for view tracking
function setupViewTracking() {
  if (!window.IntersectionObserver) {
    console.warn("IntersectionObserver not supported");
    return;
  }
  
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const card = entry.target;
      const poemId = card.dataset.id;
      
      if (entry.isIntersecting) {
        startTrackingPoem(poemId);
      } else {
        stopTrackingPoem(poemId);
      }
    }
  }, {
    threshold: 0.5
  });
  
  function observePoemCards() {
    const cards = document.querySelectorAll('.recent-poem-card:not([data-view-tracked])');
    cards.forEach(card => {
      card.setAttribute('data-view-tracked', 'true');
      observer.observe(card);
    });
  }
  
  observePoemCards();
  
  const container = document.getElementById('recent-poems-container');
  if (container) {
    const mutationObserver = new MutationObserver(() => {
      observePoemCards();
    });
    mutationObserver.observe(container, { childList: true, subtree: false });
  }
}

async function loadPoemsBatch() {
  if (loading || reachedEnd) return;
  loading = true;

  const container = document.getElementById("recent-poems-container");
  if (!container) {
    loading = false;
    return;
  }

  try {
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
      
      poems.sort((a, b) => b.timestamp - a.timestamp);
      allPoemsCache = poems;
    }
    
    if (allPoemsCache.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:60px 20px; color:#7a6a5a;">📜 No poems yet. Be the first to share!</div>';
      reachedEnd = true;
      loading = false;
      return;
    }
    
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
      const card = document.createElement("div");
      card.className = "recent-poem-card";
      card.dataset.id = docId;

      const truncated = truncatePoem(poem.content, 8);
      const likes = typeof poem.likes === "number" ? poem.likes : 0;
      const viewCount = typeof poem.views === "number" ? poem.views : 0;

      // Helper functions for avatar
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
      
      // Author info
      const poetUid = poem.authorId;
      let displayName = "Anonymous Poet";
      let profileLink = "#";
      let profileImage = "/images/default-avatar.png";
      let isFollowing = false;

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
          if (currentUserId && currentUserId !== poetUid) {
            isFollowing = await checkFollowStatus(poetUid, currentUserId);
          }
        } catch (err) {
          console.warn("Failed to fetch user info:", err);
        }
      }

      // Collaborators info
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
            collaboratorLinks.push(`<a href="${collabLink}" class="collaborator-link">${collabName}</a>`);
          }
          if (collaboratorLinks.length) {
            collaboratorsHTML = `<div class="collaborator-line" style="margin-top:4px; font-size:0.95rem; color:#555;"><em>Co-written with ${collaboratorLinks.join(", ")}</em></div>`;
          }
        } catch (err) {
          console.warn("Failed to fetch collaborators:", err);
        }
      }

      // Audio section
      let audioHTML = '';
      if (poem.audioUrl) {
        audioHTML = `<div class="poem-audio-section" style="margin: 15px 0 15px 0 !important; padding: 8px 12px !important; background: #f0ede8; border-radius: 12px; width: fit-content; max-width: 45%; min-width: 240px; clear: both;"><div style="display: flex; align-items: center; gap: 8px; margin-bottom: 5px;"><span style="font-size: 0.75rem; color: #4b2aad; font-weight: 600;">🎙️ Spoken Version</span></div><audio controls style="width: 100%; border-radius: 8px; height: 35px;" preload="metadata"><source src="${poem.audioUrl}" type="audio/mpeg">Your browser does not support the audio element.</audio></div>`;
      }

      // Follow button
      const followButtonHTML = (currentUserId && currentUserId !== poetUid && poetUid) 
        ? `<button class="follow-btn-on-card ${isFollowing ? 'following' : ''}" data-poet-id="${poetUid}" style="background: ${isFollowing ? '#f44336' : '#4CAF50'}; color: white; border: none; border-radius: 20px; padding: 4px 12px; cursor: pointer; font-size: 12px; margin-left: auto; transition: all 0.2s;">${isFollowing ? 'Following' : 'Follow'}</button>`
        : '';

      // MAIN POEM CARD HTML WITH VIEW COUNT
      card.innerHTML = `
        <div class="author-line" style="display:flex; align-items:center; gap:10px; margin-bottom:2px;">
          <img src="${profileImage}" alt="${displayName}" class="author-img" style="width:50px; height:50px; border-radius:50%; object-fit:cover;">
          <a href="${profileLink}" class="author-link" style="font-size:1.2rem; font-weight:700;">${displayName}</a>
          ${followButtonHTML}
        </div>
        ${collaboratorsHTML}
        <h3 class="recent-poem-title" style="margin-top:12px;">${poem.title || "Untitled"}</h3>
        <p class="poem-content" style="white-space:pre-wrap; margin-top:8px; margin-left:0; padding-left:0;">${truncated.preview.trim()}</p>
        ${truncated.truncated ? `<button class="read-more-btn">Read More</button>` : ""}
        ${audioHTML}
        ${poem.categories?.length ? `<p class="poem-category-line"><em>${poem.categories.map(cat => `<a href="category.html?name=${encodeURIComponent(cat)}" class="category-link">${cat}</a>`).join(", ")}</em></p>` : ""}
        
        <!-- VIEW COUNT DISPLAY -->
        <div class="poem-stats" style="display: flex; gap: 15px; margin: 10px 0 8px 0; font-size: 0.8rem; color: #888; border-top: 1px solid #eee; padding-top: 8px;">
          <span class="view-count">👁️ ${viewCount} ${viewCount === 1 ? 'read' : 'reads'}</span>
        </div>
        
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

      // Add comment list
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
      const msgSpan = card.querySelector(".message-count");
      if (msgSpan) msgSpan.textContent = `💬 ${commentsSnapshot.size}`;

      // Auto-resize comment box
      const textarea = card.querySelector(".comment-input");
      if (textarea) {
        textarea.addEventListener("input", () => {
          textarea.style.height = "auto";
          textarea.style.height = textarea.scrollHeight + "px";
        });
      }
    }
    
    // Attach follow button event listeners
    document.querySelectorAll('.follow-btn-on-card').forEach(btn => {
      const poetId = btn.dataset.poetId;
      btn.removeEventListener('click', btn._followHandler);
      btn._followHandler = async (e) => {
        e.stopPropagation();
        await handleFollowFromPoem(poetId, btn);
      };
      btn.addEventListener('click', btn._followHandler);
    });

    currentIndex = end;
    if (currentIndex >= allPoemsCache.length) reachedEnd = true;
    loading = false;
    
    if (container.children.length === 0 && allPoemsCache.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding:60px 20px; color:#7a6a5a;">Fetching poems...</div>';
    }
  } catch (err) {
    console.error("Error fetching poems:", err);
    loading = false;
  }
}

// Helper function to get comment list
function getCommentList(card) {
  if (!card) return null;
  const nextSibling = card.nextElementSibling;
  if (nextSibling && nextSibling.classList.contains("comment-list")) return nextSibling;
  return null;
}

// Auth State Listener
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserId = user.uid;
    allPoemsCache = [];
    currentIndex = 0;
    reachedEnd = false;
    const container = document.getElementById("recent-poems-container");
    if (container) container.innerHTML = '';
    loadPoemsBatch();
  } else {
    currentUserId = null;
    followStates.clear();
    allPoemsCache = [];
    currentIndex = 0;
    reachedEnd = false;
    const container = document.getElementById("recent-poems-container");
    if (container) container.innerHTML = '';
    loadPoemsBatch();
  }
});

// Load first batch
window.addEventListener("DOMContentLoaded", () => {
  loadPoemsBatch();
  setupViewTracking();
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
      userDisplay.innerHTML = `<span class="username"> ${username}</span><div class="dropdown-content"><a href="#" id="logout-link">Logout</a></div>`;
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

// --- Like / Comment / Reply Handler - COMPLETE FIXED VERSION ---
document.addEventListener("click", async (e) => {
  const user = auth.currentUser;

  // LIKE / UNLIKE
  if (e.target.classList.contains("like-btn")) {
    if (!user) { 
      redirectToLogin();
      return; 
    }
    const card = e.target.closest(".recent-poem-card");
    if (!card) return;
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
    if (!card) return;
    const docId = card.dataset.id;
    const input = card.querySelector(".comment-input");
    const commentList = getCommentList(card);
    const text = input.value.trim();
    if (!text) return;

    try {
      const userDoc = await getDoc(doc(db, "users", user.uid));
      let username = "Anonymous";
      if (userDoc.exists()) username = userDoc.data().username || user.email;

      const newCommentRef = await addDoc(collection(db, "recentPoems", docId, "comments"), {
        userId: user.uid,
        username: username,
        text,
        timestamp: serverTimestamp()
      });

      const div = document.createElement("div");
      div.className = "comment";
      div.dataset.commentId = newCommentRef.id;
      div.dataset.userId = user.uid;
      div.style.cssText = "background:#f0f0f0; padding:8px 12px; margin:6px 0; border-radius:6px;";
      div.innerHTML = `
        <a href="user-profile.html?uid=${encodeURIComponent(user.uid)}" class="comment-author-link" style="font-weight:600; color:#5a3cb3; text-decoration:none;">${escapeHtml(username)}</a>: ${escapeHtml(text)}
        <div><small class="reply-toggle" style="color:#5a3cb3; cursor:pointer;">Reply</small></div>
        <div class="reply-section" style="margin-left:20px; margin-top:5px;"></div>
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
      alert("Failed to post comment. Please try again.");
    }
  }
  
  // SHOW COMMENTS WITH REPLIES
  if (e.target.classList.contains("message-count")) {
    e.preventDefault();
    e.stopPropagation();
    
    const card = e.target.closest(".recent-poem-card");
    if (!card) return;
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
        div.style.cssText = "background:#fff; padding:8px 12px; margin:6px 0; border-radius:6px; border:1px solid #eee;";
        
        const usernameLink = comment.userId 
          ? `<a href="/user-profile.html?uid=${encodeURIComponent(comment.userId)}" style="font-weight:600; color:#5a3cb3; text-decoration:none; cursor:pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(comment.username || "Anonymous")}</a>`
          : `<span style="font-weight:600; color:#5a3cb3;">${escapeHtml(comment.username || "Anonymous")}</span>`;
        
        div.innerHTML = `
          ${usernameLink}: ${escapeHtml(comment.text)}
          <div><small class="reply-toggle" style="color:#5a3cb3; cursor:pointer;">Reply</small></div>
          <div class="reply-section" style="margin-left:20px; margin-top:5px;"></div>
        `;
        commentList.appendChild(div);
        
        // LOAD EXISTING REPLIES
        try {
          const repliesCol = collection(db, "recentPoems", docId, "comments", docSnap.id, "replies");
          const repliesSnapshot = await getDocs(query(repliesCol, orderBy("timestamp", "asc")));
          if (!repliesSnapshot.empty) {
            const replySection = div.querySelector(".reply-section");
            repliesSnapshot.forEach(replyDoc => {
              const reply = replyDoc.data();
              const replyUsernameLink = reply.userId
                ? `<a href="/user-profile.html?uid=${encodeURIComponent(reply.userId)}" style="font-weight:600; color:#B8860B; text-decoration:none; cursor:pointer;" onmouseover="this.style.textDecoration='underline'" onmouseout="this.style.textDecoration='none'">${escapeHtml(reply.username)}</a>`
                : `<span style="font-weight:600; color:#B8860B;">${escapeHtml(reply.username)}</span>`;
              
              const replyDiv = document.createElement("div");
              replyDiv.style.cssText = "background:#f7f7f7; padding:6px 10px; margin:4px 0; border-radius:6px; font-size:0.9rem;";
              replyDiv.setAttribute('data-reply-id', replyDoc.id);
              replyDiv.innerHTML = `${replyUsernameLink}: ${escapeHtml(reply.text)}`;
              replySection.appendChild(replyDiv);
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

  // REPLY TOGGLE - SHOW INPUT FORM
  if (e.target.classList.contains("reply-toggle")) {
    e.preventDefault();
    e.stopPropagation();
    
    const commentDiv = e.target.closest(".comment");
    if (!commentDiv) return;
    
    const replySection = commentDiv.querySelector(".reply-section");
    if (!replySection) return;

    // Remove existing reply input if any
    const existing = replySection.querySelector(".reply-input");
    if (existing) {
      existing.remove();
      return;
    }

    // Create reply input form
    const inputContainer = document.createElement("div");
    inputContainer.className = "reply-input";
    inputContainer.style.marginTop = "8px";
    inputContainer.innerHTML = `
      <textarea placeholder="Write a reply..." rows="2" style="width:100%; padding:8px; border-radius:8px; border:1px solid #ccc; font-family:inherit; resize:vertical;"></textarea>
      <div style="display:flex; gap:8px; margin-top:6px;">
        <button class="send-reply-btn" style="background:#5a3cb3; color:white; border:none; border-radius:6px; padding:6px 12px; cursor:pointer;">Send Reply</button>
        <button class="cancel-reply-btn" style="background:#ccc; color:#333; border:none; border-radius:6px; padding:6px 12px; cursor:pointer;">Cancel</button>
      </div>
    `;
    replySection.appendChild(inputContainer);
    
    const textarea = inputContainer.querySelector("textarea");
    if (textarea) textarea.focus();
    
    const cancelBtn = inputContainer.querySelector(".cancel-reply-btn");
    if (cancelBtn) {
      cancelBtn.addEventListener("click", (cancelEvent) => {
        cancelEvent.preventDefault();
        cancelEvent.stopPropagation();
        inputContainer.remove();
      });
    }
  }

  // SEND REPLY - COMPLETE WORKING VERSION
  if (e.target.classList.contains("send-reply-btn")) {
    e.preventDefault();
    e.stopPropagation();
    
    if (!auth.currentUser) { 
      alert("Please sign in to reply."); 
      redirectToLogin();
      return; 
    }

    const user = auth.currentUser;
    const sendBtn = e.target;
    const originalText = sendBtn.textContent;
    
    // Disable button and show loading
    sendBtn.textContent = "Sending...";
    sendBtn.disabled = true;
    sendBtn.style.opacity = "0.6";

    try {
      // Find comment div
      const commentDiv = e.target.closest(".comment");
      if (!commentDiv) throw new Error("Could not find comment");
      
      // Find poem card
      let card = commentDiv.closest(".recent-poem-card");
      if (!card) {
        const commentList = commentDiv.closest(".comment-list");
        if (commentList) {
          card = commentList.previousElementSibling;
          while (card && !card.classList.contains("recent-poem-card")) {
            card = card.previousElementSibling;
          }
        }
      }
      if (!card) throw new Error("Could not find poem card");
      
      const docId = card.dataset.id;
      const commentId = commentDiv.dataset.commentId;
      if (!docId || !commentId) throw new Error("Missing comment or poem ID");
      
      // Find reply input
      const replyInputDiv = commentDiv.querySelector(".reply-input");
      if (!replyInputDiv) throw new Error("Reply input not found");
      
      const textarea = replyInputDiv.querySelector("textarea");
      if (!textarea) throw new Error("Textarea not found");
      
      const replyText = textarea.value.trim();
      if (!replyText) throw new Error("Please enter a reply");
      
      const replySection = commentDiv.querySelector(".reply-section");
      
      // Get user info
      const userDoc = await getDoc(doc(db, "users", user.uid));
      const username = userDoc.exists() ? userDoc.data().username || user.email.split('@')[0] : "User";

      // Add reply to Firestore
      const repliesRef = collection(db, "recentPoems", docId, "comments", commentId, "replies");
      const replyDoc = await addDoc(repliesRef, {
        userId: user.uid,
        username: username,
        text: replyText,
        timestamp: serverTimestamp()
      });

      // Create reply HTML
      const replyUsernameLink = `<a href="/user-profile.html?uid=${encodeURIComponent(user.uid)}"
                                   style="font-weight:600; color:#B8860B; text-decoration:none; cursor:pointer;"
                                   onmouseover="this.style.textDecoration='underline'"
                                   onmouseout="this.style.textDecoration='none'">
                                   ${escapeHtml(username)}
                                 </a>`;

      const replyDiv = document.createElement("div");
      replyDiv.style.cssText = "background:#f7f7f7; padding:6px 10px; margin:4px 0; border-radius:6px; font-size:0.9rem;";
      replyDiv.setAttribute('data-reply-id', replyDoc.id);
      replyDiv.innerHTML = `${replyUsernameLink}: ${escapeHtml(replyText)}`;
      
      // Insert before the reply input or append to section
      if (replyInputDiv) {
        replySection.insertBefore(replyDiv, replyInputDiv);
      } else {
        replySection.appendChild(replyDiv);
      }
      
      // Clear and remove input
      textarea.value = "";
      replyInputDiv.remove();
      
      // Show success message
      const tempMsg = document.createElement("div");
      tempMsg.style.cssText = "color:green; font-size:12px; margin-top:5px;";
      tempMsg.textContent = "✓ Reply posted!";
      replySection.appendChild(tempMsg);
      setTimeout(() => tempMsg.remove(), 2000);
      
      console.log("Reply posted successfully!");
      
    } catch (err) {
      console.error("Error sending reply:", err);
      alert(err.message || "Failed to send reply. Please try again.");
    } finally {
      // Re-enable button
      sendBtn.textContent = originalText;
      sendBtn.disabled = false;
      sendBtn.style.opacity = "1";
    }
  }
});

// --- DOM Initialization & Tabs ---
document.addEventListener("DOMContentLoaded", () => {
  setupOfflineNotice();

  const faders = document.querySelectorAll('.fade-in');
  window.addEventListener('scroll', () => {
    faders.forEach(fader => {
      const rect = fader.getBoundingClientRect();
      if (rect.top < window.innerHeight - 100) fader.classList.add('visible');
    });
  });

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

// Username display and logout
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

// Search functionality
const universalSearchInput = document.getElementById("global-search-input");
const mobileSearchInput = document.getElementById("mobile-search-input");

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

// Poetry Gallery
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
      return `<div class="gallery-item fade-in ${visibilityClass}"><div class="gallery-overlay"><h3>${escapeHtml(p.title)}</h3><p style="white-space: pre-line;">${escapeHtml(preview)}${lines.length > 6 ? "..." : ""}</p><span class="author">By ${escapeHtml(p.author)}</span><a href="${url}" class="view-poem-btn" style="text-decoration:none; display:inline-block; margin-top:10px; padding:6px 12px; background:#4b2aad; color:#fff; border-radius:8px;">View Poem</a></div></div>`;
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

// Load Categories
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
    const categories = Array.from(categoriesSet).sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
    if (categories.length === 0) return;
    const limitedCategories = categories.slice(0, 38);
    const categoriesHTML = limitedCategories.map(cat => `<a href="category.html?name=${encodeURIComponent(cat)}" class="category-card">${escapeHtml(cat)}</a>`).join("");
    const allCategoriesLink = `<a href="all-categories.html" class="category-card all-categories">All Categories →</a>`;
    container.innerHTML = `<div class="categories-grid">${categoriesHTML}${allCategoriesLink}</div>`;
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

// Load all content
document.addEventListener("DOMContentLoaded", () => {
  loadPoetryGallery();
  loadAllCategories();
  loadWeeklyHighlights();
});

// Ranking Poems (simplified)
async function loadRankingPoemsRich() {
  const container = document.getElementById("rank-poems");
  if (!container) return;
  container.innerHTML = `<h3>Ranking Poems</h3><p>Top 20 poems based on views, likes, and comments.</p><div id="ranking-list"></div>`;
  const listEl = container.querySelector("#ranking-list");
  listEl.innerHTML = "";
  try {
    const snapshot = await getDocs(collection(db, "recentPoems"));
    if (snapshot.empty) {
      listEl.innerHTML = "<p style='color:#666;'>No poems found.</p>";
      return;
    }
    const poems = await Promise.all(snapshot.docs.map(async docSnap => {
      const data = docSnap.data() || {};
      const views = typeof data.views === "number" ? data.views : 0;
      const likes = typeof data.likes === "number" ? data.likes : 0;
      let realComments = 0;
      try {
        const commentSnap = await getDocs(collection(db, "recentPoems", docSnap.id, "comments"));
        realComments = commentSnap.size;
      } catch {}
      const score = views + likes * 3 + realComments * 5;
      return { id: docSnap.id, title: data.title || "Untitled", views, likes, score, commentsCount: realComments };
    }));
    poems.sort((a, b) => b.score - a.score);
    const top = poems.slice(0, 20);
    listEl.innerHTML = top.map((p, i) => `<div style="padding:10px; border-bottom:1px solid #eee;"><strong>${i+1}. ${escapeHtml(p.title)}</strong> - 👁️ ${p.views} reads | ❤️ ${p.likes} likes | 💬 ${p.commentsCount} comments | Score: ${p.score}</div>`).join("");
  } catch (err) {
    console.error("Error loading ranking poems:", err);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("rank-poems")) loadRankingPoemsRich();
  if (document.getElementById("ranking-poets-container")) loadRankingPoets();
});

// Load Ranking Poets (simplified)
async function loadRankingPoets() {
  const container = document.getElementById("ranking-poets-container");
  if (!container) return;
  try {
    const poemsSnapshot = await getDocs(collection(db, "recentPoems"));
    const usersSnapshot = await getDocs(collection(db, "users"));
    const poetsMap = {};
    usersSnapshot.forEach(userDoc => {
      const data = userDoc.data();
      const username = data.username || "Anonymous";
      poetsMap[username] = { userId: userDoc.id, username, poemsWritten: 0, likesReceived: 0, commentsReceived: 0, score: 0 };
    });
    poemsSnapshot.forEach(docSnap => {
      const data = docSnap.data();
      const username = data.username || data.submittedBy || data.author || "Anonymous";
      if (!poetsMap[username]) poetsMap[username] = { userId: data.userId || null, username, poemsWritten: 0, likesReceived: 0, commentsReceived: 0, score: 0 };
      poetsMap[username].poemsWritten += 1;
      poetsMap[username].likesReceived += data.likes || 0;
    });
    Object.values(poetsMap).forEach(poet => { poet.score = poet.poemsWritten * 5 + poet.likesReceived * 3; });
    const sortedPoets = Object.values(poetsMap).filter(poet => poet.score > 0).sort((a, b) => b.score - a.score).slice(0, 20);
    container.innerHTML = sortedPoets.map((poet, i) => `<div style="padding:10px;"><strong>${i+1}. ${escapeHtml(poet.username)}</strong> - ${poet.poemsWritten} poems, ${poet.likesReceived} likes</div>`).join("");
  } catch (err) {
    console.error("Error loading ranking poets:", err);
  }
}

// Load when page is ready
document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("ranking-poets-container")) {
    loadRankingPoets();
  }
});

// Load weekly highlights on all pages
document.addEventListener("DOMContentLoaded", () => {
  loadWeeklyHighlights();
});