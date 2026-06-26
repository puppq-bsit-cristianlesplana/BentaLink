function updateListingStatusFromStock(listing) {
    if (!listing) return;
    if (["hidden", "deleted", "pending"].includes(listing.status)) return;
    const stock = getListingStock(listing);
    if (stock <= 0) {
      if (listing.status === "available") {
        listing.status = "reserved";
      }
    } else if (listing.status === "sold") {
      listing.status = "available";
    }
  }
/* =========================================================
   Local Connect — standalone app logic
   Everything is stored in localStorage. No backend required.
   ========================================================= */

(function () {
  "use strict";

  // ---------------------------------------------------------
  // Storage helpers
  // ---------------------------------------------------------
  const DB_KEY = "lc_db_v1";

  function loadDB() {
    try {
      const raw = localStorage.getItem(DB_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) { /* fall through to seed */ }
    return seedDB();
  }

  function saveDB() {
    localStorage.setItem(DB_KEY, JSON.stringify(DB));
  }

  function nextId(table) {
    DB.meta[table] = (DB.meta[table] || 0) + 1;
    return DB.meta[table];
  }

  function seedDB() {
    const db = {
      meta: { users: 0, listings: 0, savedItems: 0, conversations: 0, messages: 0, reservations: 0, reports: 0, warnings: 0, notifications: 0, auditLog: 0, tradeRequests: 0 },
      users: [],
      listings: [],
      savedItems: [],
      conversations: [],
      messages: [],
      reservations: [],
      reports: [],
      warnings: [],
      notifications: [],
      auditLog: [],
      tradeRequests: [],
      session: { userId: null },
    };
    return db;
  }

  let DB = loadDB();

  // ---------------------------------------------------------
  // Listing image helpers
  // ---------------------------------------------------------
  function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i += 1) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }

  function escapeXml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }

  function createListingPlaceholder(listing) {
    const title = (listing?.title || "Item").trim();
    const category = (listing?.category || "Local Connect").trim();
    const initials = title
      .split(/\s+/)
      .filter(Boolean)
      .map((word) => word[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) || "LC";
    const hue = hashString(title + "|" + category) % 360;
    const hue2 = (hue + 28) % 360;
    const titleLine = title.length > 28 ? `${title.slice(0, 25)}…` : title;
    const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 460" role="img" aria-label="${escapeXml(title)}">
        <defs>
          <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stop-color="hsl(${hue} 65% 62%)"/>
            <stop offset="100%" stop-color="hsl(${hue2} 72% 42%)"/>
          </linearGradient>
        </defs>
        <rect width="600" height="460" rx="32" fill="url(#bg)"/>
        <circle cx="495" cy="92" r="72" fill="rgba(255,255,255,0.16)"/>
        <circle cx="110" cy="380" r="96" fill="rgba(255,255,255,0.10)"/>
        <rect x="88" y="86" width="424" height="288" rx="24" fill="rgba(255,255,255,0.18)" stroke="rgba(255,255,255,0.28)" stroke-width="2"/>
        <rect x="130" y="130" width="220" height="200" rx="20" fill="rgba(255,255,255,0.18)" />
        <rect x="374" y="154" width="104" height="20" rx="10" fill="rgba(255,255,255,0.50)"/>
        <rect x="374" y="188" width="164" height="14" rx="7" fill="rgba(255,255,255,0.26)"/>
        <rect x="374" y="214" width="132" height="14" rx="7" fill="rgba(255,255,255,0.26)"/>
        <text x="194" y="251" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="70" font-weight="800" fill="#ffffff">${escapeXml(initials)}</text>
        <text x="130" y="362" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700" fill="#ffffff">${escapeXml(category)}</text>
        <text x="130" y="392" font-family="Inter, Arial, sans-serif" font-size="18" font-weight="500" fill="rgba(255,255,255,0.90)">${escapeXml(titleLine)}</text>
      </svg>`;
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
  }

  function getListingImageSrc(listing) {
    return listing?.image || createListingPlaceholder(listing);
  }

  function listingImageMarkup(listing, className, wrapperStyle = "") {
    const src = escapeHtml(getListingImageSrc(listing));
    const alt = escapeHtml(listing?.title ? `${listing.title} image` : "Item image");
    const styleAttr = wrapperStyle ? ` style="${wrapperStyle}"` : "";
    return `<div class="${className}"${styleAttr}><img src="${src}" alt="${alt}" /></div>`;
  }


  function getListingStock(listing) {
    if (!listing) return 0;
    if (typeof listing.stockQuantity === "number") return Math.max(0, Math.floor(listing.stockQuantity));
    if (typeof listing.stock === "number") return Math.max(0, Math.floor(listing.stock));
    return listing.status === "sold" ? 0 : 1;
  }

  function getListingReportedCount(listingId) {
    return (DB.reports || []).filter((report) => report.listingId === listingId).length;
  }

  const REPORT_REASON_OPTIONS = [
    "Inappropriate content",
    "Prohibited item",
    "Scam or fake listing",
    "Spam or repetitive post",
    "Incorrect item information",
    "Offensive language",
    "Duplicate listing",
    "Other",
  ];

  const SUSPICIOUS_TERMS = [
    "counterfeit",
    "fake",
    "illegal",
    "banned",
    "weapon",
    "gun",
    "ammo",
    "scam",
    "too good to be true",
    "refund only",
    "crypto",
    "phishing",
  ];

  const MODERATION_KEYWORDS = [
    "marijuana",
    "weed",
    "cannabis",
    "shabu",
    "cocaine",
    "meth",
    "nude",
    "porn",
    "sex",
    "scam",
    "fake",
    "counterfeit",
    "illegal",
  ];

  function findModerationKeyword(...parts) {
    const text = parts.filter(Boolean).join(" ").toLowerCase();
    return MODERATION_KEYWORDS.find((term) => text.includes(term)) || "";
  }

  function hasSuspiciousTerms(...parts) {
    return !!findModerationKeyword(...parts);
  }

  function ensureAuditLog() {
    if (!Array.isArray(DB.auditLog)) DB.auditLog = [];
    return DB.auditLog;
  }

  function ensureNotifications() {
    if (!Array.isArray(DB.notifications)) DB.notifications = [];
    return DB.notifications;
  }

  function pushNotification(opts) {
    if (!opts || !opts.userId) return null;
    const notification = {
      id: nextId("notifications"),
      userId: opts.userId,
      type: opts.type || "system",
      title: opts.title || "Update",
      body: opts.body || "",
      link: opts.link || "",
      listingId: opts.listingId || null,
      reservationId: opts.reservationId || null,
      createdAt: Date.now(),
      readAt: null,
    };
    ensureNotifications().unshift(notification);
    if (DB.notifications.length > 250) DB.notifications.length = 250;
    saveDB();
    return notification;
  }

  function countUnreadNotifications() {
    const user = currentUser();
    if (!user) return 0;
    return (DB.notifications || []).filter((n) => n.userId === user.id && !n.readAt).length;
  }

  function markNotificationsRead(notificationIds = null) {
    const user = currentUser();
    if (!user) return;
    const ids = notificationIds ? new Set(notificationIds) : null;
    (DB.notifications || []).forEach((n) => {
      if (n.userId !== user.id) return;
      if (ids && !ids.has(n.id)) return;
      n.readAt = n.readAt || Date.now();
    });
    saveDB();
  }

  function recordAudit(action, details = {}) {
    const entry = {
      id: nextId("auditLog"),
      action,
      createdAt: Date.now(),
      ...details,
    };
    ensureAuditLog().unshift(entry);
    if (DB.auditLog.length > 200) DB.auditLog.length = 200;
    return entry;
  }

  function ensureWarningHistory(user) {
    if (!user) return null;
    if (!Array.isArray(user.warningHistory)) user.warningHistory = [];
    if (typeof user.warningCount !== "number") user.warningCount = user.warningHistory.length;
    return user;
  }

  function issueUserWarning(userId, note, source = "system", listingId = null) {
    const user = ensureWarningHistory(getUser(userId));
    if (!user) return null;
    const warning = {
      id: nextId("warnings"),
      note: note || "Policy violation",
      source,
      listingId,
      createdAt: Date.now(),
    };
    user.warningHistory.unshift(warning);
    user.warningCount = (user.warningCount || 0) + 1;
    user.restrictionLevel = user.warningCount >= 5 ? "suspended" : user.warningCount >= 3 ? "restricted" : "active";
    user.restricted = user.restrictionLevel !== "active";
    user.suspended = user.restrictionLevel === "suspended";
    saveDB();
    pushNotification({
      userId: user.id,
      type: "warning",
      title: "Account warning",
      body: warning.note,
      link: listingId ? `#/item/${listingId}` : "#/profile",
      listingId,
    });
    recordAudit("warning_issued", { userId: user.id, listingId, source, note: warning.note });
    return warning;
  }

  function flagListingForReview(listing, keyword, source, note) {
    if (!listing) return null;
    listing.flagged = true;
    listing.reviewStatus = "flagged";
    listing.status = "hidden";
    listing.matchedKeyword = keyword || listing.matchedKeyword || "";
    listing.hiddenReason = note || (keyword ? `Matched keyword: ${keyword}` : "Flagged for review");
    listing.flagNotes = Array.isArray(listing.flagNotes) ? listing.flagNotes : [];
    const flagText = keyword ? `Matched keyword: ${keyword}` : (note || "Flagged for review");
    if (!listing.flagNotes.includes(flagText)) listing.flagNotes.unshift(flagText);
    listing.moderationNotifiedAt = Date.now();
    pushNotification({
      userId: listing.sellerId,
      type: "moderation",
      title: "Item under review",
      body: `${listing.title} was flagged: ${listing.hiddenReason}`,
      link: `#/item/${listing.id}`,
      listingId: listing.id,
    });

    saveDB();
    recordAudit("listing_flagged", { listingId: listing.id, sellerId: listing.sellerId, keyword, source, note: listing.hiddenReason });
    return listing;
  }

  function revealListing(listingId) {
    const listing = DB.listings.find((item) => item.id === listingId);
    if (!listing) return null;
    listing.status = getListingStock(listing) > 0 ? "available" : "reserved";
    listing.flagged = false;
    listing.reviewStatus = "approved";
    listing.matchedKeyword = "";
    listing.hiddenReason = "";
    listing.flagNotes = [];
    if (listing.sellerId) {
      pushNotification({
        userId: listing.sellerId,
        type: "moderation",
        title: "Item approved",
        body: `${listing.title} has been approved and is visible again.`,
        link: `#/item/${listing.id}`,
        listingId: listing.id,
      });
    }
    saveDB();
    recordAudit("listing_reappeared", { listingId });
    return listing;
  }

  function updateListingStatusFromStock(listing) {
    if (!listing) return;
    if (["hidden", "deleted", "pending"].includes(listing.status)) return;
    const stock = getListingStock(listing);
    if (stock <= 0) {
      if (listing.status !== "reserved" && listing.status !== "sold") {
        listing.status = "sold";
      }
    } else if (listing.status === "sold" || listing.status === "reserved") {
      listing.status = "available";
    }
  }

  function ensureListingReviewFields(listing) {
    if (!listing) return;
    if (typeof listing.stockQuantity !== "number") {
      listing.stockQuantity = listing.status === "sold" || listing.status === "reserved" ? 0 : 1;
    }
    if (!listing.reviewStatus) listing.reviewStatus = "";
    if (!listing.flagged) listing.flagged = false;
    if (listing.reviewStatus === "flagged" && listing.status !== "hidden") listing.status = "hidden";
    if (!Array.isArray(listing.reportReasons)) listing.reportReasons = [];
    if (typeof listing.reportCount !== "number") listing.reportCount = listing.reportReasons.length;
    updateListingStatusFromStock(listing);
  }

  function createReport(opts) {
    const listing = DB.listings.find((item) => item.id === opts.listingId);
    if (!listing) return null;

    const keyword = findModerationKeyword(listing.title, listing.description, opts.reason, opts.explanation, opts.note);
    const report = {
      id: nextId("reports"),
      listingId: opts.listingId,
      reporterId: opts.reporterId,
      reason: opts.reason,
      explanation: opts.explanation || "",
      note: opts.note || "",
      attachment: opts.attachment || "",
      matchedKeyword: keyword,
      autoFlagged: !!keyword,
      status: "pending",
      createdAt: Date.now(),
    };
    DB.reports.push(report);

    listing.reviewStatus = "reported";
    listing.reportReasons = Array.isArray(listing.reportReasons) ? listing.reportReasons : [];
    if (!listing.reportReasons.includes(report.reason)) listing.reportReasons.push(report.reason);
    listing.reportCount = getListingReportedCount(listing.id);
    listing.reportedAt = listing.reportedAt || Date.now();

    if (keyword || listing.reportCount >= 2) {
      flagListingForReview(listing, keyword, "report", keyword ? `Matched keyword: ${keyword}` : "Repeated report");
      issueUserWarning(listing.sellerId, keyword ? `Auto-flagged listing for keyword "${keyword}".` : "Repeated reports on a listing.", "report", listing.id);
    } else {
      saveDB();
    }

    recordAudit("report_created", { listingId: listing.id, reporterId: opts.reporterId, keyword, autoFlagged: !!keyword });
    return report;
  }

  function getReportsForListing(listingId) {
    return (DB.reports || [])
      .filter((report) => report.listingId === listingId)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function markReportResolved(reportId) {
    const report = (DB.reports || []).find((item) => item.id === reportId);
    if (!report) return null;
    report.status = "resolved";
    saveDB();
    recordAudit("report_resolved", { reportId });
    return report;
  }

  function approveListing(listingId) {
    const listing = DB.listings.find((item) => item.id === listingId);
    if (!listing) return null;
    listing.reviewStatus = "approved";
    listing.flagged = false;
    listing.flagNotes = [];
    listing.matchedKeyword = "";
    listing.hiddenReason = "";
    if (listing.stockQuantity > 0 && listing.status === "hidden") listing.status = "available";
    if (listing.sellerId) {
      pushNotification({
        userId: listing.sellerId,
        type: "moderation",
        title: "Item approved",
        body: `${listing.title} is now public again.`,
        link: `#/item/${listing.id}`,
        listingId: listing.id,
      });
    }
    saveDB();
    recordAudit("listing_approved", { listingId });
    return listing;
  }

  function hideListing(listingId) {
    const listing = DB.listings.find((item) => item.id === listingId);
    if (!listing) return null;
    listing.status = "hidden";
    listing.reviewStatus = listing.reviewStatus || "hidden";
    if (listing.sellerId) {
      pushNotification({
        userId: listing.sellerId,
        type: "moderation",
        title: "Item hidden",
        body: `${listing.title} is hidden from public listings.`,
        link: `#/item/${listing.id}`,
        listingId: listing.id,
      });
    }
    saveDB();
    recordAudit("listing_hidden", { listingId });
    return listing;
  }

  function warnUser(userId, note) {
    const warning = issueUserWarning(userId, note || "Admin warning.", "admin");
    return warning ? getUser(userId) : null;
  }

  function suspendUser(userId) {
    const user = getUser(userId);
    if (!user) return null;
    user.suspended = true;
    user.restricted = true;
    user.restrictionLevel = "suspended";
    saveDB();
    pushNotification({
      userId: user.id,
      type: "warning",
      title: "Account suspended",
      body: "Your account has been suspended by an admin.",
      link: "#/profile",
    });
    recordAudit("user_suspended", { userId });
    return user;
  }

  function deleteListingCompletely(listingId) {
    const index = DB.listings.findIndex((item) => item.id === listingId);
    if (index === -1) return null;
    const [removed] = DB.listings.splice(index, 1);
    if (removed?.sellerId) {
      pushNotification({
        userId: removed.sellerId,
        type: "moderation",
        title: "Item removed",
        body: `${removed.title} was deleted from the marketplace.`,
        link: "#/profile",
      });
    }
    saveDB();
    recordAudit("listing_deleted", { listingId, sellerId: removed?.sellerId || null });
    return removed;
  }

  // Seed some demo sellers + listings the first time the app runs,
  // so Browse isn't empty on a fresh load.
  function ensureSeedListings() {
    if (DB.listings.length > 0) return;

    const demoUsers = [
      { name: "Maria Santos", barangay: "Barangay San Antonio" },
      { name: "Jericho Reyes", barangay: "Barangay Poblacion" },
      { name: "Liza Aquino", barangay: "Barangay Malusay" },
      { name: "Tonyo Cruz", barangay: "Barangay San Isidro" },
    ].map((u) => {
      const id = nextId("users");
      const user = {
        id,
        openId: "seed-" + id,
        name: u.name,
        email: null,
        loginMethod: "seed",
        barangay: u.barangay,
        role: "user",
        createdAt: Date.now(),
      };
      DB.users.push(user);
      return user;
    });

    const demoListings = [
      { title: "Handmade Tote Bag", description: "Woven abaca tote, sturdy handles, great for market runs or everyday use.", price: "350.00", category: "Crafts & Handmade", stockQuantity: 8 },
      { title: "Homemade Banana Bread", description: "Freshly baked banana bread, no preservatives. Order a day ahead.", price: "120.00", category: "Food & Drinks", stockQuantity: 12 },
      { title: "iPhone 11 64GB", description: "Used but well taken care of. Minor scratches on the back. Complete set.", price: "8500.00", category: "Devices & Electronics", stockQuantity: 1, isSecondHand: true },
      { title: "Vintage Denim Jacket", description: "Size M, pre-loved, still in great condition. No stains or tears.", price: "450.00", category: "Pre-loved Items", stockQuantity: 2 },
      { title: "Hand-poured Soy Candles", description: "Lavender and vanilla scented soy candles, 8oz jars, 40-hour burn time.", price: "199.00", category: "Crafts & Handmade", stockQuantity: 10, openForTrade: true, tradeFor: "Books, plants, or kitchen items" },
      { title: "Home Aircon Cleaning", description: "Professional aircon cleaning service, split-type units. Same day available.", price: "600.00", category: "Services", stockQuantity: 1 },
      { title: "Kids' Bicycle (16-inch)", description: "Lightly used kids bike with training wheels. Good for ages 4-7.", price: "1800.00", category: "Pre-loved Items", stockQuantity: 1, isSecondHand: true },
      { title: "Fresh Tilapia (1kg)", description: "Farm-fresh tilapia, cleaned and ready to cook. Order before 6PM for same-day pickup.", price: "180.00", category: "Food & Drinks", stockQuantity: 20 },
    ];

    const locations = ["Barangay San Antonio", "Barangay Poblacion", "Barangay Malusay", "Barangay San Isidro"];

    demoListings.forEach((l, idx) => {
      const seller = demoUsers[idx % demoUsers.length];
      const id = nextId("listings");
      DB.listings.push({
        id,
        sellerId: seller.id,
        title: l.title,
        description: l.description,
        price: l.price,
        category: l.category,
        location: locations[idx % locations.length],
        image: createListingPlaceholder(l),
        stockQuantity: l.stockQuantity || 1,
        allowReservations: true,
        meetUpAvailable: true,
        deliveryAvailable: true,
        isSecondHand: l.isSecondHand || false,
        openForTrade: l.openForTrade || false,
        tradeFor: l.tradeFor || "",
        status: "available",
        createdAt: Date.now() - (demoListings.length - idx) * 3600 * 1000,
      });
    });

    saveDB();
  }

  ensureSeedListings();

  function ensureAdminUser() {
    let admin = DB.users.find((u) => u.email === "admin@demo.com");
    if (!admin) {
      const id = nextId("users");
      admin = {
        id,
        openId: "seed-admin",
        name: "Admin",
        email: "admin@demo.com",
        loginMethod: "seed",
        barangay: "Head Office",
        role: "admin",
        createdAt: Date.now(),
      };
      DB.users.push(admin);
      saveDB();
    }
  }

  ensureAdminUser();

  function migrateExistingData() {
    let changed = false;
    if (!Array.isArray(DB.reports)) { DB.reports = []; changed = true; }
    if (!Array.isArray(DB.auditLog)) { DB.auditLog = []; changed = true; }
    if (!Array.isArray(DB.warnings)) { DB.warnings = []; changed = true; }
    if (!Array.isArray(DB.notifications)) { DB.notifications = []; changed = true; }

    if (!Array.isArray(DB.tradeRequests)) { DB.tradeRequests = []; changed = true; }
    if (typeof DB.meta.tradeRequests !== 'number') { DB.meta.tradeRequests = DB.tradeRequests.length; changed = true; }

    DB.listings.forEach((listing) => {
      if (typeof listing.meetUpAvailable === 'undefined') { listing.meetUpAvailable = true; changed = true; }
      if (typeof listing.deliveryAvailable === 'undefined') { listing.deliveryAvailable = true; changed = true; }
      if (typeof listing.stockQuantity !== 'number') { listing.stockQuantity = listing.status === 'sold' || listing.status === 'reserved' ? 0 : 1; changed = true; }
      if (!listing.reviewStatus) { listing.reviewStatus = ''; changed = true; }
      if (!Array.isArray(listing.reportReasons)) { listing.reportReasons = []; changed = true; }
      if (typeof listing.reportCount !== 'number') { listing.reportCount = listing.reportReasons.length; changed = true; }
      if (typeof listing.flagged !== 'boolean') { listing.flagged = false; changed = true; }
      if (!listing.matchedKeyword) { listing.matchedKeyword = ''; changed = true; }
      if (!listing.hiddenReason) { listing.hiddenReason = ''; changed = true; }
      if (!Array.isArray(listing.flagNotes)) { listing.flagNotes = []; changed = true; }
      if (listing.reviewStatus === 'flagged' && listing.status !== 'hidden') { listing.status = 'hidden'; changed = true; }
      if (typeof listing.openForTrade !== 'boolean') { listing.openForTrade = false; changed = true; }
      if (typeof listing.isSecondHand !== 'boolean') { listing.isSecondHand = false; changed = true; }
      if (typeof listing.tradeFor !== 'string') { listing.tradeFor = ''; changed = true; }
    });

    DB.users.forEach((user) => {
      if (!Array.isArray(user.warningHistory)) { user.warningHistory = []; changed = true; }
      if (typeof user.warningCount !== 'number') { user.warningCount = user.warningHistory.length; changed = true; }
      if (!Array.isArray(user.notificationPrefs)) { user.notificationPrefs = { muted: false }; changed = true; }
      if (!user.restrictionLevel) { user.restrictionLevel = user.warningCount >= 5 ? 'suspended' : user.warningCount >= 3 ? 'restricted' : 'active'; changed = true; }
      if (typeof user.restricted !== 'boolean') { user.restricted = user.restrictionLevel !== 'active'; changed = true; }
      if (typeof user.suspended !== 'boolean') { user.suspended = user.restrictionLevel === 'suspended'; changed = true; }
    });

    if (!Array.isArray(DB.notifications)) { DB.notifications = []; changed = true; }
    DB.reservations.forEach((reservation) => {
      if (!reservation.receivingMethod) { reservation.receivingMethod = 'meetup'; changed = true; }
      if (typeof reservation.courier === 'undefined') { reservation.courier = null; changed = true; }
      if (reservation.status === 'confirmed') {
        reservation.status = reservation.paymentType === 'full' ? 'sold' : 'reserved';
        changed = true;
      }
      if (!reservation.trackingStatus || (reservation.trackingStatus === 'Order Confirmed' && !Array.isArray(reservation.trackingHistory))) {
        reservation.trackingStatus = reservation.trackingStatus || 'Order Confirmed';
        changed = true;
      }
      if (!Array.isArray(reservation.trackingHistory) || reservation.trackingHistory.length === 0) {
        reservation.trackingHistory = [{ status: reservation.trackingStatus, at: reservation.createdAt || Date.now() }];
        changed = true;
      }
      if (typeof reservation.quantity !== 'number') { reservation.quantity = 1; changed = true; }
      if (typeof reservation.completedAt === 'undefined') { reservation.completedAt = null; }
    });

    if (changed) saveDB();
  }

  migrateExistingData();

  // ---------------------------------------------------------
  // Query helpers
  // ---------------------------------------------------------
  function getUser(id) {
    return DB.users.find((u) => u.id === id) || null;
  }

  function currentUser() {
    if (!DB.session.userId) return null;
    return getUser(DB.session.userId);
  }

  function isAuthenticated() {
    return !!currentUser();
  }

  function getListing(id) {
    const listing = DB.listings.find((l) => l.id === id);
    if (!listing) return null;
    return { ...listing, seller: getUser(listing.sellerId) };
  }

  function searchListings(searchTerm, category, opts = {}) {
    let results = DB.listings.slice();
    if (category && category !== "All") {
      results = results.filter((l) => l.category === category);
    }
    results = results.filter((l) => isListingAvailable(l));
    if (opts.tradeOnly) {
      results = results.filter((l) => l.openForTrade === true);
    }
    if (searchTerm && searchTerm.trim()) {
      const t = searchTerm.trim().toLowerCase();
      results = results.filter(
        (l) => l.title.toLowerCase().includes(t) || l.description.toLowerCase().includes(t) || (l.tradeFor || "").toLowerCase().includes(t)
      );
    }
    results.sort((a, b) => b.createdAt - a.createdAt);
    return results;
  }

  function isSaved(userId, listingId) {
    return DB.savedItems.some((s) => s.userId === userId && s.listingId === listingId);
  }

  function toggleSaved(userId, listingId) {
    const idx = DB.savedItems.findIndex((s) => s.userId === userId && s.listingId === listingId);
    if (idx >= 0) {
      DB.savedItems.splice(idx, 1);
      saveDB();
      return { saved: false };
    } else {
      DB.savedItems.push({ id: nextId("savedItems"), userId, listingId, createdAt: Date.now() });
      saveDB();
      return { saved: true };
    }
  }

  function listSavedItems(userId) {
    return DB.savedItems
      .filter((s) => s.userId === userId)
      .map((s) => ({ ...s, listing: getListing(s.listingId) }))
      .filter((s) => s.listing)
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  const DELIVERY_TRACKING_STEPS = ['Waiting for Seller Confirmation', 'Order Confirmed', 'Preparing Item', 'Picked Up by Courier', 'Out for Delivery', 'Delivered', 'Awaiting Confirmation', 'Completed'];
  const MEETUP_TRACKING_STEPS = ['Waiting for Seller Confirmation', 'Order Confirmed', 'Waiting for Meet-up', 'Awaiting Confirmation', 'Completed'];

  function getReservation(id) {
    return DB.reservations.find((r) => r.id === id) || null;
  }

  function getTrackingSteps(reservation) {
    return reservation?.receivingMethod === 'delivery' ? DELIVERY_TRACKING_STEPS : MEETUP_TRACKING_STEPS;
  }

  function normalizeReservation(reservation) {
    if (!reservation) return null;
    if (!reservation.receivingMethod) reservation.receivingMethod = 'meetup';
    if (typeof reservation.courier === 'undefined') reservation.courier = null;
    if (!reservation.trackingStatus) reservation.trackingStatus = 'Order Confirmed';
    if (!Array.isArray(reservation.trackingHistory)) reservation.trackingHistory = [];
    if (reservation.trackingHistory.length === 0) {
      reservation.trackingHistory.push({ status: reservation.trackingStatus, at: reservation.createdAt || Date.now() });
    }
    if (typeof reservation.completedAt === 'undefined') reservation.completedAt = null;
    return reservation;
  }

  function getReservationProgress(reservation) {
    const steps = getTrackingSteps(reservation);
    const activeIndex = Math.max(0, steps.indexOf(reservation?.trackingStatus || steps[0]));
    return { steps, activeIndex };
  }

  function listOrdersForUser(userId) {
    return DB.reservations
      .map((reservation) => normalizeReservation(reservation))
      .filter((reservation) => {
        const listing = getListing(reservation.listingId);
        return reservation.buyerId === userId || listing?.sellerId === userId;
      })
      .map((reservation) => ({
        ...reservation,
        listing: getListing(reservation.listingId),
        buyer: getUser(reservation.buyerId),
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  function updateReservationTracking(reservationId, nextStatus) {
    const reservation = normalizeReservation(getReservation(reservationId));
    if (!reservation) return null;
    const steps = getTrackingSteps(reservation);
    if (!steps.includes(nextStatus)) return reservation;
    reservation.trackingStatus = nextStatus;
    reservation.trackingHistory.push({ status: nextStatus, at: Date.now() });
    saveDB();
    recordAudit("reservation_updated", { reservationId, nextStatus });
    return reservation;
  }

  function advanceReservationTracking(reservationId) {
    const reservation = normalizeReservation(getReservation(reservationId));
    if (!reservation) return null;
    const steps = getTrackingSteps(reservation);
    const idx = Math.max(0, steps.indexOf(reservation.trackingStatus));
    const maxAdvanceIndex = Math.max(0, steps.indexOf('Awaiting Confirmation'));
    if (idx >= maxAdvanceIndex) return null;
    const next = steps[Math.min(idx + 1, maxAdvanceIndex)];
    if (next !== reservation.trackingStatus) {
      reservation.trackingStatus = next;
      reservation.trackingHistory.push({ status: next, at: Date.now() });
      saveDB();
      recordAudit("reservation_advanced", { reservationId, nextStatus: next });
    }
    return reservation;
  }

  function confirmReservationReceived(reservationId) {
    const reservation = normalizeReservation(getReservation(reservationId));
    if (!reservation) return null;
    const user = currentUser();
    if (!user || user.id !== reservation.buyerId) return null;
    if (!['Delivered', 'Awaiting Confirmation'].includes(reservation.trackingStatus)) return reservation;
    reservation.trackingStatus = 'Completed';
    reservation.trackingHistory.push({ status: 'Completed', at: Date.now() });
    reservation.status = 'completed';
    reservation.completedAt = Date.now();
    const listing = DB.listings.find((l) => l.id === reservation.listingId);
    if (listing) {
      const stock = getListingStock(listing);
      listing.status = stock <= 0 ? 'sold' : 'available';
      pushNotification({
        userId: listing.sellerId,
        type: "order",
        title: "Transaction completed",
        body: `${listing.title} was marked as received.`,
        link: `#/orders?reservationId=${reservation.id}`,
        listingId: listing.id,
        reservationId: reservation.id,
      });
      pushNotification({
        userId: user.id,
        type: "order",
        title: "Transaction completed",
        body: `You marked ${listing.title} as received.`,
        link: `#/orders?reservationId=${reservation.id}`,
        listingId: listing.id,
        reservationId: reservation.id,
      });
    }
    saveDB();
    recordAudit("reservation_completed", { reservationId, buyerId: user.id });
    return reservation;
  }

  function findOrCreateConversation(buyerId, sellerId, listingId) {
    let convo = DB.conversations.find(
      (c) => c.buyerId === buyerId && c.sellerId === sellerId && c.listingId === listingId
    );
    if (!convo) {
      convo = {
        id: nextId("conversations"),
        buyerId,
        sellerId,
        listingId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      DB.conversations.push(convo);
      saveDB();
    }
    return convo;
  }

  function deleteConversation(conversationId) {
    // Remove all messages in this conversation
    DB.messages = DB.messages.filter((m) => m.conversationId !== conversationId);
    // Remove the conversation itself (and any duplicates with same id)
    DB.conversations = DB.conversations.filter((c) => c.id !== conversationId);
    // Clean up read state
    if (DB.readState) delete DB.readState[conversationId];
    saveDB();
  }

  function listConversationsForUser(userId) {
    // Deduplicate: for same (buyerId, sellerId, listingId) keep only the conversation
    // with the most recent message (or most recently updated).
    const seen = new Map(); // key -> best convo so far
    DB.conversations
      .filter((c) => c.buyerId === userId || c.sellerId === userId)
      .forEach((c) => {
        const key = [Math.min(c.buyerId, c.sellerId), Math.max(c.buyerId, c.sellerId), c.listingId].join("|");
        const msgs = DB.messages.filter((m) => m.conversationId === c.id).sort((a, b) => a.createdAt - b.createdAt);
        const lastMsgTs = msgs.length ? msgs[msgs.length - 1].createdAt : c.updatedAt;
        if (!seen.has(key) || lastMsgTs > (seen.get(key)._lastMsgTs || 0)) {
          seen.set(key, { ...c, _msgs: msgs, _lastMsgTs: lastMsgTs });
        } else {
          // Merge messages from the duplicate into the winner
          const winner = seen.get(key);
          msgs.forEach((m) => {
            if (!winner._msgs.find((wm) => wm.id === m.id)) winner._msgs.push(m);
          });
          winner._msgs.sort((a, b) => a.createdAt - b.createdAt);
          const newTs = winner._msgs.length ? winner._msgs[winner._msgs.length - 1].createdAt : winner.updatedAt;
          winner._lastMsgTs = newTs;
        }
      });

    return Array.from(seen.values())
      .map((c) => {
        const otherId = c.buyerId === userId ? c.sellerId : c.buyerId;
        const lastMsg = c._msgs.length ? c._msgs[c._msgs.length - 1] : null;
        const { _msgs, _lastMsgTs, ...rest } = c;
        return {
          ...rest,
          otherUser: getUser(otherId),
          listing: getListing(c.listingId),
          lastMessage: lastMsg,
        };
      })
      .sort((a, b) => (b.lastMessage?.createdAt || b.updatedAt) - (a.lastMessage?.createdAt || a.updatedAt));
  }

  function getMessages(conversationId) {
    return DB.messages
      .filter((m) => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt - b.createdAt)
      .map((m) => ({ ...m, sender: getUser(m.senderId) }));
  }

  function sendMessage(conversationId, senderId, content) {
    const msg = {
      id: nextId("messages"),
      conversationId,
      senderId,
      content,
      createdAt: Date.now(),
    };
    DB.messages.push(msg);
    const convo = DB.conversations.find((c) => c.id === conversationId);
    if (convo) convo.updatedAt = Date.now();
    saveDB();
    return msg;
  }

  function isListingAvailable(listing) {
    if (!listing) return false;
    if (["hidden", "deleted", "pending"].includes(listing.status)) return false;
    return getListingStock(listing) > 0;
  }

  function createReservation(opts) {
    const ref = "LC-" + Math.random().toString(36).slice(2, 8).toUpperCase();
    const receivingMethod = opts.receivingMethod || 'meetup';
    const trackingStatus = 'Waiting for Seller Confirmation';
    const quantity = Math.max(1, Math.floor(Number(opts.quantity || 1)));
    const reservation = {
      id: nextId("reservations"),
      buyerId: opts.buyerId,
      listingId: opts.listingId,
      quantity,
      paymentType: opts.paymentType,
      downpaymentPercentage: opts.downpaymentPercentage || null,
      itemPrice: opts.itemPrice,
      amountPaid: opts.amountPaid,
      remainingBalance: opts.remainingBalance,
      serviceFee: opts.serviceFee,
      paymentMethod: opts.paymentMethod,
      paymentReference: opts.paymentReference || null,
      paymentScreenshot: opts.paymentScreenshot || null,
      receivingMethod,
      courier: receivingMethod === 'delivery' ? (opts.courier || 'J&T Express') : null,
      trackingStatus,
      trackingHistory: [{ status: trackingStatus, at: Date.now() }],
      referenceNumber: ref,
      status: "awaiting_confirmation",
      completedAt: null,
      createdAt: Date.now(),
    };
    DB.reservations.push(reservation);

    const listing = DB.listings.find((l) => l.id === opts.listingId);
    if (listing) {
      const currentStock = getListingStock(listing);
      const nextStock = Math.max(0, currentStock - quantity);
      listing.stockQuantity = nextStock;
      listing.status = nextStock <= 0 ? "reserved" : "available";
    }

    let conversationId = null;
    if (listing) {
      const convo = findOrCreateConversation(opts.buyerId, listing.sellerId, listing.id);
      conversationId = convo.id;
      pushNotification({
        userId: listing.sellerId,
        type: "order",
        title: "New reservation",
        body: `${quantity} ${quantity === 1 ? 'unit' : 'units'} of ${listing.title} are waiting for your confirmation.`,
        link: `#/orders?reservationId=${reservation.id}`,
        listingId: listing.id,
        reservationId: reservation.id,
      });
      pushNotification({
        userId: opts.buyerId,
        type: "order",
        title: "Reservation sent",
        body: `Your reservation for ${listing.title} is waiting for seller confirmation.`,
        link: `#/orders?reservationId=${reservation.id}`,
        listingId: listing.id,
        reservationId: reservation.id,
      });
    }

    saveDB();
    recordAudit("reservation_created", { reservationId: reservation.id, listingId: reservation.listingId, buyerId: reservation.buyerId });
    return { ...reservation, conversationId };
  }

  function confirmReservation(reservationId) {
    const reservation = normalizeReservation(getReservation(reservationId));
    if (!reservation) return null;
    reservation.status = "reserved";
    reservation.trackingStatus = "Order Confirmed";
    reservation.trackingHistory.push({ status: "Order Confirmed", at: Date.now() });

    const listing = DB.listings.find((l) => l.id === reservation.listingId);
    if (listing) {
      const stock = getListingStock(listing);
      listing.status = stock <= 0 ? "reserved" : "available";
      pushNotification({
        userId: reservation.buyerId,
        type: "order",
        title: "Order confirmed",
        body: `${listing.title} has been confirmed by the seller.`,
        link: `#/orders?reservationId=${reservation.id}`,
        listingId: listing.id,
        reservationId: reservation.id,
      });
      pushNotification({
        userId: listing.sellerId,
        type: "order",
        title: "Order confirmed",
        body: `You confirmed ${listing.title}.`,
        link: `#/orders?reservationId=${reservation.id}`,
        listingId: listing.id,
        reservationId: reservation.id,
      });
    }

    saveDB();
    recordAudit("reservation_confirmed", { reservationId });
    return reservation;
  }

  function declineReservation(reservationId, reason) {
    const reservation = normalizeReservation(getReservation(reservationId));
    if (!reservation) return null;
    reservation.status = "declined";
    reservation.trackingStatus = "Declined by Seller";
    reservation.trackingHistory.push({ status: "Declined by Seller", at: Date.now() });
    reservation.declineReason = reason || null;

    const listing = DB.listings.find((l) => l.id === reservation.listingId);
    if (listing) {
      listing.stockQuantity = Math.max(getListingStock(listing), 0) + Math.max(1, reservation.quantity || 1);
      if (!["hidden", "deleted"].includes(listing.status)) {
        listing.status = "available";
      }
      pushNotification({
        userId: reservation.buyerId,
        type: "order",
        title: "Order declined",
        body: `${listing.title} was declined${reason ? `: ${reason}` : ""}.`,
        link: `#/orders?reservationId=${reservation.id}`,
        listingId: listing.id,
        reservationId: reservation.id,
      });
      pushNotification({
        userId: listing.sellerId,
        type: "order",
        title: "Order declined",
        body: `You declined ${listing.title}.`,
        link: `#/orders?reservationId=${reservation.id}`,
        listingId: listing.id,
        reservationId: reservation.id,
      });
    }

    saveDB();
    recordAudit("reservation_declined", { reservationId, reason: reservation.declineReason || "" });
    return reservation;
  }

  // ---------------------------------------------------------
  // Icon injection
  // ---------------------------------------------------------
  function injectIcons(root) {
    (root || document).querySelectorAll("[data-icon]").forEach((el) => {
      const name = el.getAttribute("data-icon");
      if (ICONS[name] && !el.dataset.iconInjected) {
        el.innerHTML = ICONS[name];
        el.dataset.iconInjected = "1";
      }
    });
  }

  // ---------------------------------------------------------
  // Toast
  // ---------------------------------------------------------
  let toastTimer = null;
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2200);
  }

  // ---------------------------------------------------------
  // Router
  // ---------------------------------------------------------
  const SCREENS = [
    "welcome", "home", "signin", "signup", "browse", "item", "post",
    "reservation", "confirmation", "report", "admin", "orders", "profile", "saved", "chat", "inbox", "notifications", "settings", "notfound",
    "trade", "mytrades", "user",
  ];

  let route = { name: "welcome", params: {} };

  function parseHash() {
    const hash = location.hash.replace(/^#\/?/, "");
    const [path, query] = hash.split("?");
    const parts = path.split("/").filter(Boolean);
    const qs = new URLSearchParams(query || "");

    if (parts.length === 0) return { name: isAuthenticated() ? "home" : "welcome", params: {}, qs };
    const seg0 = parts[0];

    switch (seg0) {
      case "":
      case "home": return { name: isAuthenticated() ? "home" : "welcome", params: {}, qs };
      case "signin": return { name: "signin", params: {}, qs };
      case "signup": return { name: "signup", params: {}, qs };
      case "browse": return { name: "browse", params: {}, qs };
      case "item": return { name: "item", params: { id: parseInt(parts[1], 10) }, qs };
      case "post": return { name: "post", params: {}, qs };
      case "reservation": return { name: "reservation", params: { id: parseInt(parts[1], 10) }, qs };
      case "confirmation": return { name: "confirmation", params: {}, qs };
      case "report": return { name: "report", params: { id: parseInt(parts[1], 10) }, qs };
      case "admin": return { name: "admin", params: {}, qs };
      case "orders": return { name: "orders", params: {}, qs };
      case "profile": return { name: "profile", params: {}, qs };
      case "saved": return { name: "saved", params: {}, qs };
      case "inbox": return { name: "inbox", params: {}, qs };
      case "notifications": return { name: "notifications", params: {}, qs };
      case "trade": return { name: "browse", params: { tab: "trade" }, qs };
      case "mytrades": return { name: "mytrades", params: {}, qs };
      case "settings": return { name: "settings", params: {}, qs };
      case "chat": return { name: "chat", params: { conversationId: parseInt(parts[1], 10) }, qs };
      case "user": return { name: "user", params: { id: parseInt(parts[1], 10) }, qs };
      default: return { name: "notfound", params: {}, qs };
    }
  }

  function navigate(path) {
    location.hash = path;
    closeMobileMenu();
  }

  function showScreen(name) {
    SCREENS.forEach((s) => {
      const el = document.getElementById("screen-" + s);
      if (!el) return;
      el.classList.toggle("active", s === name);
    });
  }

  function renderRoute() {
    route = parseHash();
    let name = route.name;

    if ((name === "post" || name === "saved" || name === "profile" || name === "inbox" || name === "notifications" || name === "reservation" || name === "chat" || name === "report" || name === "admin" || name === "orders") && !isAuthenticated()) {
      // Still render — these screens render their own "please sign in" state.
    }

    showScreen(name);

    switch (name) {
      case "home": renderHome(); break;
      case "browse": renderBrowse(); break;
      case "mytrades": renderMyTrades(); break;
      case "item": renderItem(route.params.id); break;
      case "post": renderPost(route.qs); break;
      case "reservation": renderReservation(route.params.id); break;
      case "confirmation": renderConfirmation(route.qs); break;
      case "report": renderReport(route.params.id); break;
      case "admin": renderAdmin(); break;
      case "orders": renderOrders(route.qs, true); break;
      case "profile": renderProfile(); break;
      case "saved": renderSaved(); break;
      case "inbox": renderInbox(); break;
      case "notifications": renderNotifications(); break;
      case "chat": renderChat(route.params.conversationId); break;
      case "settings": renderSettings(); break;
      case "user": renderUserProfile(route.params.id); break;
      default: break;
    }

    injectIcons(document);
    renderSiteHeader();
    window.scrollTo(0, 0);
  }

  window.addEventListener("hashchange", renderRoute);

  // ---------------------------------------------------------
  // Site header (top navbar) — replaces the old bottom tab bar.
  // Handles active-link highlighting, login/avatar state,
  // unread message badges, and the mobile hamburger menu.
  // ---------------------------------------------------------
  function countUnreadMessages() {
    const user = currentUser();
    if (!user) return 0;
    // "Unread" = conversations whose latest message was sent by the OTHER person
    // and the conversation hasn't been opened since (tracked in DB.readState).
    const convos = listConversationsForUser(user.id);
    let count = 0;
    convos.forEach((c) => {
      if (!c.lastMessage) return;
      if (c.lastMessage.senderId === user.id) return; // last message was mine, nothing new
      const lastRead = (DB.readState && DB.readState[c.id]) || 0;
      if (c.lastMessage.createdAt > lastRead) count++;
    });
    return count;
  }

  function markConversationRead(conversationId) {
    if (!DB.readState) DB.readState = {};
    DB.readState[conversationId] = Date.now();
    saveDB();
  }

  // Screens that should highlight a given top-nav link as "active".
  const NAV_ACTIVE_MAP = {
    home: "home",
    browse: "browse",
    trade: "browse",
    item: "browse",
    saved: "saved",
    inbox: "inbox",
    chat: "inbox",
    profile: null,
  };

  function renderSiteHeader() {
    const user = currentUser();
    const activeKey = NAV_ACTIVE_MAP[route.name] || null;
    const unread = countUnreadMessages();
    const unreadNotifications = countUnreadNotifications();

    document.querySelectorAll(".site-nav__link[data-nav]").forEach((link) => {
      link.classList.toggle("active", link.getAttribute("data-nav") === activeKey);
    });
    const inboxLink = document.getElementById("site-nav-inbox");
    inboxLink.classList.toggle("active", activeKey === "inbox");
    inboxLink.onclick = () => navigate("#/inbox");
    const badge = document.getElementById("site-nav-badge");
    if (unread > 0) {
      badge.hidden = false;
      badge.textContent = unread > 9 ? "9+" : String(unread);
    } else {
      badge.hidden = true;
    }

    const avatarBtn = document.getElementById("site-avatar-btn");
    const authActions = document.getElementById("auth-actions");
    const mobileAuth = document.getElementById("mobile-menu-auth");
    const adminTopBtn = document.getElementById("site-admin-btn");
    const notifBtn = document.getElementById("site-notifications-btn");
    if (user) {
      avatarBtn.style.display = "flex";
      authActions.style.display = "none";
      mobileAuth.style.display = "none";
      document.getElementById("site-avatar-initials").textContent = initials(user.name);
      avatarBtn.classList.toggle("active", route.name === "profile");
    } else {
      avatarBtn.style.display = "none";
      authActions.style.display = "flex";
      mobileAuth.style.display = "flex";
    }
    if (adminTopBtn) {
      adminTopBtn.style.display = user && user.role === "admin" ? "inline-flex" : "none";
      adminTopBtn.classList.toggle("active", route.name === "admin");
    }
    if (notifBtn) {
      notifBtn.style.display = user ? "inline-flex" : "none";
      notifBtn.classList.toggle("active", route.name === "notifications");
      const notifBadge = notifBtn.querySelector(".site-nav__badge");
      if (notifBadge) {
        if (unreadNotifications > 0) { notifBadge.hidden = false; notifBadge.textContent = unreadNotifications > 9 ? "9+" : String(unreadNotifications); }
        else { notifBadge.hidden = true; }
      }
    }

    const mobileInbox = document.getElementById("mobile-menu-inbox");
    mobileInbox.textContent = unread > 0 ? `Messages (${unread > 9 ? "9+" : unread})` : "Messages";
    mobileInbox.onclick = () => navigate("#/inbox");
    const mobileNotifs = document.getElementById("mobile-menu-notifications");
    if (mobileNotifs) {
      mobileNotifs.style.display = user ? "flex" : "none";
      mobileNotifs.textContent = unreadNotifications > 0 ? `Notifications (${unreadNotifications > 9 ? "9+" : unreadNotifications})` : "Notifications";
      mobileNotifs.onclick = () => navigate("#/notifications");
    }
    const mobileAdmin = document.getElementById("mobile-menu-admin");
    if (mobileAdmin) {
      mobileAdmin.style.display = user && user.role === "admin" ? "flex" : "none";
      mobileAdmin.classList.toggle("active", route.name === "admin");
      mobileAdmin.onclick = () => navigate("#/admin");
    }
  }

  function closeMobileMenu() {
    document.getElementById("mobile-menu").classList.remove("open");
  }

  document.getElementById("hamburger-btn").addEventListener("click", () => {
    document.getElementById("mobile-menu").classList.toggle("open");
  });

  // ---------------------------------------------------------
  // Screen: Home
  // ---------------------------------------------------------
  const CATEGORY_DEFS = [
    { key: "Food & Drinks",          icon: "utensils"      },
    { key: "Devices & Electronics",  icon: "smartphoneText"},
    { key: "Clothes & Fashion",      icon: "shirt"         },
    { key: "Crafts & Handmade",      icon: "toolbox"       },
    { key: "Pre-loved Items",        icon: "recycle"       },
    { key: "Services",               icon: "toolbox"       },
    { key: "Home & Living",          icon: "home"          },
    { key: "Books & School",         icon: "bookmark"      },
    { key: "Sports & Outdoors",      icon: "flag"          },
    { key: "Beauty & Health",        icon: "shieldCheck"   },
    { key: "Toys & Kids",            icon: "star"          },
    { key: "Vehicles & Parts",       icon: "recycle"       },
    { key: "Pet Supplies",           icon: "mapPin"        },
    { key: "Agriculture & Plants",   icon: "utensils"      },
  ];

  function renderHome() {
    // ── Category: horizontally scrollable big card row ──────
    const scrollRow = document.getElementById("home-category-scroll");
    if (scrollRow) {
      scrollRow.innerHTML = "";
      CATEGORY_DEFS.forEach((cat) => {
        const card = document.createElement("button");
        card.className = "cat-scroll-card";
        card.innerHTML = `
          <span class="cat-scroll-card__icon" data-icon="${cat.icon}"></span>
          <span class="cat-scroll-card__label">${escapeHtml(cat.key)}</span>`;
        card.addEventListener("click", () => {
          browseState.category = cat.key;
          navigate("#/browse");
        });
        scrollRow.appendChild(card);
      });
    }

    // ── Trending / Popular section ──────────────────────────
    const trendingGrid = document.getElementById("home-trending-grid");
    if (trendingGrid) {
      // "Popular" = most-saved + most-reserved, fallback: newest
      const saveCounts = {};
      DB.savedItems.forEach((s) => { saveCounts[s.listingId] = (saveCounts[s.listingId] || 0) + 1; });
      const resCounts = {};
      DB.reservations.forEach((r) => { resCounts[r.listingId] = (resCounts[r.listingId] || 0) + 1; });
      const trending = DB.listings
        .filter((l) => isListingAvailable(l))
        .map((l) => ({ ...l, seller: getUser(l.sellerId), _score: (saveCounts[l.id] || 0) * 2 + (resCounts[l.id] || 0) * 3 }))
        .sort((a, b) => b._score - a._score || b.createdAt - a.createdAt)
        .slice(0, 6);
      renderListingCardsInto(trendingGrid, trending, "No popular items yet.");
    }

    // ── Brand New items ─────────────────────────────────────
    const brandNewGrid = document.getElementById("home-brandnew-grid");
    if (brandNewGrid) {
      const brandNew = searchListings("", "All")
        .filter((l) => !l.isSecondHand && !l.openForTrade)
        .slice(0, 4);
      renderListingCardsInto(brandNewGrid, brandNew, "No brand-new items yet.");
    }

    // ── 2nd Hand / Pre-loved items ──────────────────────────
    const secondHandGrid = document.getElementById("home-secondhand-grid");
    if (secondHandGrid) {
      const secondHand = searchListings("", "All")
        .filter((l) => l.isSecondHand)
        .slice(0, 4);
      renderListingCardsInto(secondHandGrid, secondHand, "No pre-loved items yet.");
    }

    // ── Wire "See all" buttons ──────────────────────────────
    const homeBrowseNewBtn = document.getElementById("home-browse-new-btn");
    if (homeBrowseNewBtn) {
      homeBrowseNewBtn.onclick = () => {
        browseConditionTab = "new";
        browseActiveTab = "buy";
        navigate("#/browse");
      };
    }
    const homeBrowseUsedBtn = document.getElementById("home-browse-used-btn");
    if (homeBrowseUsedBtn) {
      homeBrowseUsedBtn.onclick = () => {
        browseConditionTab = "used";
        browseActiveTab = "buy";
        navigate("#/browse");
      };
    }

    // ── Trade items ─────────────────────────────────────────
    const tradeGrid = document.getElementById("home-trade-grid");
    if (tradeGrid) {
      const tradeItems = searchListings("", "All", { tradeOnly: true }).slice(0, 4);
      renderListingCardsInto(tradeGrid, tradeItems, "No items open for trade yet.");
    }
  }

  // ---------------------------------------------------------
  // Shared: render a list of listings into a grid container
  // ---------------------------------------------------------
  function listingStatusRibbon(listing) {
    if (listing.isSecondHand && listing.status === "available") return `<span class="status-ribbon status-ribbon--secondhand">2nd Hand</span>`;
    if (listing.status === "sold") return `<span class="status-ribbon status-ribbon--sold">Sold</span>`;
    if (listing.status === "reserved") return `<span class="status-ribbon status-ribbon--reserved">Reserved</span>`;
    if (listing.status === "pending") return `<span class="status-ribbon status-ribbon--pending">Pending</span>`;
    if (listing.status === "hidden" || listing.flagged) return `<span class="status-ribbon status-ribbon--review">Under review</span>`;
    return "";
  }

  function renderListingCardsInto(container, listings, emptyMessage, isOwnerView) {
    container.innerHTML = "";
    if (listings.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">No items found</p>
          <p class="empty-state__sub">${escapeHtml(emptyMessage || "Try a different search or category.")}</p>
        </div>`;
      return;
    }
    listings.forEach((listing) => {
      const card = document.createElement("button");
      const unavailable = !isListingAvailable(listing);
      card.className = "listing-card" + (unavailable ? " listing-card--unavailable" : "");
      let ownerReviewLabel = "";
      if (isOwnerView) {
        if (listing.status === "hidden" || listing.flagged) {
          ownerReviewLabel = `<p class="listing-card__stock listing-card__stock--warning">Under review \u2014 hidden from public</p>`;
        } else if (listing.reviewStatus === "reported") {
          ownerReviewLabel = `<p class="listing-card__stock listing-card__stock--warning">Reported \u2014 still visible to public</p>`;
        }
      }
      card.innerHTML = `
        <div class="listing-card__media">
          ${listingImageMarkup(listing, "listing-card__img")}
          ${listingStatusRibbon(listing)}
        </div>
        <div class="listing-card__body">
          <h3 class="listing-card__title">${escapeHtml(listing.title)}</h3>
          <p class="listing-card__price">\u20b1${escapeHtml(listing.price)}</p>
          <p class="listing-card__stock">${escapeHtml(String(getListingStock(listing)))} in stock</p>
          ${ownerReviewLabel}
          <p class="listing-card__desc">${escapeHtml(listing.description)}</p>
          <p class="listing-card__loc">${ICONS.mapPin} ${escapeHtml(listing.location)}</p>
        </div>`;
      card.addEventListener("click", () => navigate(`#/item/${listing.id}`));
      container.appendChild(card);
    });
  }

  // ---------------------------------------------------------
  // Screen: Browse
  // ---------------------------------------------------------
  const CATEGORIES = ["All","Food & Drinks","Devices & Electronics","Clothes & Fashion","Crafts & Handmade","Pre-loved Items","Services","Home & Living","Books & School","Sports & Outdoors","Beauty & Health","Toys & Kids","Vehicles & Parts","Pet Supplies","Agriculture & Plants"];
  let browseState = { searchTerm: "", category: "All" };

  let browseActiveTab = "buy"; // "buy" | "trade"
  let browseConditionTab = "all"; // "all" | "new" | "used"

  function renderBrowse() {
    // Sync tab from route params if navigated via #/trade
    if (route.params && route.params.tab === "trade") {
      browseActiveTab = "trade";
      route.params.tab = null; // consume it
    }

    // Tab buttons
    const tabs = document.querySelectorAll(".browse-tab[data-browse-tab]");
    tabs.forEach((btn) => {
      const tab = btn.getAttribute("data-browse-tab");
      btn.classList.toggle("active", tab === browseActiveTab);
      btn.onclick = () => {
        browseActiveTab = tab;
        renderBrowse();
      };
    });

    // Show/hide panels
    const buyPanel = document.getElementById("browse-buy-panel");
    const tradePanel = document.getElementById("browse-trade-panel");
    buyPanel.hidden = browseActiveTab !== "buy";
    tradePanel.hidden = browseActiveTab !== "trade";

    if (browseActiveTab === "buy") {
      // Desktop sidebar category list
      const catList = document.getElementById("browse-categories");
      catList.innerHTML = "";
      CATEGORIES.forEach((cat) => {
        const item = document.createElement("button");
        item.className = "category-list__item" + (browseState.category === cat ? " active" : "");
        item.textContent = cat;
        item.addEventListener("click", () => {
          browseState.category = cat;
          renderBrowse();
        });
        catList.appendChild(item);
      });

      // Mobile chip row
      const chipRow = document.getElementById("browse-chips");
      chipRow.innerHTML = "";
      CATEGORIES.forEach((cat) => {
        const chip = document.createElement("button");
        chip.className = "chip" + (browseState.category === cat ? " active" : "");
        chip.textContent = cat;
        chip.addEventListener("click", () => {
          browseState.category = cat;
          renderBrowse();
        });
        chipRow.appendChild(chip);
      });

      const searchInput = document.getElementById("browse-search");
      if (searchInput.value !== browseState.searchTerm) searchInput.value = browseState.searchTerm;
      searchInput.oninput = (e) => {
        browseState.searchTerm = e.target.value;
        renderBrowseResults();
      };

      renderBrowseResults();
    } else {
      renderTrade();
    }
  }

  function renderBrowseResults() {
    let results = searchListings(browseState.searchTerm, browseState.category);
    if (browseConditionTab === "new")  results = results.filter((l) => !l.isSecondHand);
    if (browseConditionTab === "used") results = results.filter((l) => l.isSecondHand);
    document.getElementById("browse-count").textContent =
      `${results.length} item${results.length !== 1 ? "s" : ""} near you`;
    // render condition tabs
    const condTabsEl = document.getElementById("browse-condition-tabs");
    if (condTabsEl) {
      condTabsEl.innerHTML = [
        { key: "all",  label: "All" },
        { key: "new",  label: "Brand New" },
        { key: "used", label: "2nd Hand" },
      ].map(({ key, label }) =>
        `<button class="browse-cond-tab${browseConditionTab === key ? " active" : ""}" data-cond="${key}">${label}</button>`
      ).join("");
      condTabsEl.querySelectorAll("[data-cond]").forEach((btn) => {
        btn.addEventListener("click", () => {
          browseConditionTab = btn.getAttribute("data-cond");
          renderBrowseResults();
        });
      });
    }
    renderListingCardsInto(document.getElementById("browse-list"), results);
  }

  // ---------------------------------------------------------
  // Screen: Item details
  // ---------------------------------------------------------
  function renderItem(id) {
    const layout = document.getElementById("item-layout");
    const listing = getListing(id);

    if (!listing) {
      layout.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;padding-top:80px">
          <p class="empty-state__title">Item not found</p>
        </div>`;
      return;
    }

    const sellerInitials = initials(listing.seller?.name);
    const saved = isAuthenticated() && isSaved(currentUser().id, listing.id);
    const available = isListingAvailable(listing);
    const isOwner = isAuthenticated() && currentUser().id === listing.sellerId;
    const stock = getListingStock(listing);

    const availabilityBadges = [];
    if (listing.isSecondHand) availabilityBadges.push(`<span class="availability-badge availability-badge--secondhand">Pre-loved / 2nd Hand</span>`);
    if (stock > 0) availabilityBadges.push(`<span class="availability-badge availability-badge--stock">${stock} in stock</span>`);
    if (listing.meetUpAvailable !== false) availabilityBadges.push(`<span class="availability-badge">Meet-up open</span>`);
    if (listing.deliveryAvailable !== false) availabilityBadges.push(`<span class="availability-badge availability-badge--delivery">Delivery open</span>`);

    let statusBanner = "";
    if (listing.status === "hidden" || listing.flagged) {
      statusBanner = `<div class="status-banner status-banner--warning">${ICONS.alertTriangle} This item is under review and is not public right now${isOwner ? ". You can still view it here." : "."}</div>`;
    } else if (isOwner && listing.reviewStatus === "reported") {
      statusBanner = `<div class="status-banner status-banner--warning">${ICONS.alertTriangle} This item has been reported and is under review. It is still visible to the public for now.</div>`;
    } else if (listing.status === "pending") {
      statusBanner = `<div class="status-banner status-banner--pending">${ICONS.package} This item has a reservation pending seller confirmation.</div>`;
    } else if (listing.status === "reserved") {
      statusBanner = `<div class="status-banner status-banner--reserved">${ICONS.package} This item is reserved by another buyer.</div>`;
    } else if (listing.status === "sold") {
      statusBanner = `<div class="status-banner status-banner--sold">${ICONS.package} This item has already been sold.</div>`;
    }

    let ctaMarkup;
    if (isOwner) {
      ctaMarkup = "";
    } else if (!available) {
      const label = listing.status === "sold" ? "Sold out" : "Currently unavailable";
      ctaMarkup = `<button class="btn btn--outline btn--lg" style="flex:1" disabled>${ICONS.shoppingCart} ${label}</button>`;
    } else {
      ctaMarkup = `<button class="btn btn--coral btn--lg" style="flex:1" id="item-cta-reserve">${ICONS.shoppingCart} Reserve / Buy now</button>`;
    }

    layout.innerHTML = `
      <div class="item-gallery">
        ${listingImageMarkup(listing, "item-gallery__img")}
      </div>
      <div class="item-info">
        <div class="location-badge">${ICONS.mapPin} ${escapeHtml(listing.location)}</div>
        <h1 class="item-title">${escapeHtml(listing.title)}</h1>
        <p class="item-price">₱${escapeHtml(listing.price)}</p>
        ${statusBanner}
        <p class="item-desc">${escapeHtml(listing.description)}</p>
        ${availabilityBadges.length ? `<div class="availability-row">${availabilityBadges.join('')}</div>` : ''}
        <button class="seller-row seller-row--clickable" id="item-seller-row" type="button">
          <div class="avatar">${sellerInitials}</div>
          <div class="seller-row__info">
            <p class="seller-row__name">${escapeHtml(listing.seller?.name || "Unknown")}</p>
            <p class="seller-row__meta">
              <span class="seller-row__rating-icon">${ICONS.star}</span>
              ${listing.seller?.averageRating ? `${listing.seller.averageRating.toFixed(1)} · ${listing.seller.ratingCount || 0} rating${listing.seller.ratingCount === 1 ? "" : "s"}` : "No ratings yet"}
            </p>
          </div>
          <span class="seller-row__chevron">›</span>
        </button>
        <div class="item-actions">
          <button class="btn btn--forest btn--block btn--lg" id="item-message-btn">
            ${ICONS.messageCircle} Message seller
          </button>
          <div class="item-actions__row">
            <button class="icon-square ${saved ? "is-saved" : ""}" id="item-cta-save">${ICONS[saved ? "bookmarkFilled" : "bookmark"]}</button>
            ${ctaMarkup}
          </div>
          <div class="item-actions__row item-actions__row--secondary">
            <button class="btn btn--outline btn--block" id="item-report-btn">${ICONS.flag} Report Post</button>
          </div>
          ${
            isOwner
              ? `<div class="item-actions__seller-controls"><button class="btn btn--outline btn--block" id="item-edit-btn">${ICONS.edit} Edit Listing</button><button class="btn btn--outline btn--block" id="item-delete-btn">${ICONS.trash} Delete Listing</button></div>`
              : ""
          }
        </div>
      </div>
    `;

    document.getElementById("item-message-btn").addEventListener("click", () => handleMessageSeller(listing));
    const sellerRow = document.getElementById("item-seller-row");
    if (sellerRow) {
      sellerRow.addEventListener("click", () => {
        if (listing.sellerId) navigate(`#/user/${listing.sellerId}`);
      });
    }
    document.getElementById("item-cta-save").addEventListener("click", () => handleToggleSave(listing.id));
    document.getElementById("item-report-btn").addEventListener("click", () => navigate(`#/report/${listing.id}`));
    const editBtn = document.getElementById("item-edit-btn");
    if (editBtn) {
      editBtn.addEventListener("click", () => navigate(`#/post?edit=${listing.id}`));
    }
    const deleteBtn = document.getElementById("item-delete-btn");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", () => {
        if (!confirm("Are you sure you want to delete this listing?")) return;
        deleteListing(listing.id);
      });
    }

    const reserveBtn = document.getElementById("item-cta-reserve");
    if (reserveBtn) {
      reserveBtn.addEventListener("click", () => {
        if (!isAuthenticated()) {
          showToast("Please log in to reserve items.");
          navigate("#/signin");
          return;
        }
        if (!isListingAvailable(getListing(listing.id))) {
          showToast("Sorry, this item is no longer available.");
          renderItem(listing.id);
          return;
        }
        navigate(`#/reservation/${listing.id}`);
      });
    }
  }

  function handleToggleSave(listingId) {
    if (!isAuthenticated()) {
      showToast("Please log in to save items.");
      navigate("#/signin");
      return;
    }
    const result = toggleSaved(currentUser().id, listingId);
    showToast(result.saved ? "Saved to your list" : "Removed from saved");
    renderItem(listingId);
  }

  
  function deleteListing(listingId) {
    const index = DB.listings.findIndex((listing) => listing.id === listingId);
    if (index === -1) return;

    DB.listings.splice(index, 1);
    saveDB();
    showToast("Listing deleted.");
    navigate("#/browse");
  }

function handleMessageSeller(listing) {
    if (!isAuthenticated()) {
      showToast("Please log in to message sellers.");
      navigate("#/signin");
      return;
    }
    const user = currentUser();
    if (user.id === listing.sellerId) {
      showToast("This is your own listing.");
      return;
    }
    const convo = findOrCreateConversation(user.id, listing.sellerId, listing.id);
    navigate(`#/chat/${convo.id}`);
  }

  // ---------------------------------------------------------
  // Screen: Post item
  // ---------------------------------------------------------
  const postImageState = { dataUrl: "", fileName: "" };
  let postEditingListingId = null;
  let postOriginalImage = "";
  const MAX_POST_IMAGE_BYTES = 1.5 * 1024 * 1024;

  function updatePostImagePreview() {
    const preview = document.getElementById("post-image-preview");
    if (!preview) return;

    if (postImageState.dataUrl) {
      preview.classList.add("has-image");
      preview.innerHTML = `<img src="${escapeHtml(postImageState.dataUrl)}" alt="Selected listing image preview" />`;
    } else {
      preview.classList.remove("has-image");
      preview.innerHTML = `
        <div class="image-preview__placeholder">
          <p class="image-preview__title">No image selected</p>
          <p class="image-preview__sub">Upload one clear photo of the item.</p>
        </div>`;
    }
  }

  function renderPost(qs) {
    const form = document.getElementById("form-post");
    form.reset();

    postEditingListingId = null;
    postOriginalImage = "";
    const editId = qs ? parseInt(qs.get("edit") || "0", 10) : 0;
    const listing = editId ? getListing(editId) : null;
    const isOwner = listing && isAuthenticated() && currentUser().id === listing.sellerId;

    const heading = document.querySelector("#screen-post .page-header h1");
    const subheading = document.querySelector("#screen-post .page-header p");
    const submitBtn = document.getElementById("post-submit-btn");

    document.getElementById("post-allow-reservations").checked = true;
    const meetUpToggle = document.getElementById("post-meetup-available");
    const deliveryToggle = document.getElementById("post-delivery-available");
    if (meetUpToggle) meetUpToggle.checked = true;
    if (deliveryToggle) deliveryToggle.checked = true;
    postImageState.dataUrl = "";
    postImageState.fileName = "";

    const stockInput = document.getElementById("post-stock");
    if (stockInput) stockInput.value = "1";

    if (isOwner) {
      postEditingListingId = listing.id;
      postOriginalImage = listing.image || "";
      heading.textContent = "Edit listing";
      subheading.textContent = "Update the details below and save your changes.";
      submitBtn.textContent = "Save changes";

      document.getElementById("post-title").value = listing.title || "";
      document.getElementById("post-description").value = listing.description || "";
      document.getElementById("post-price").value = listing.price || "";
      document.getElementById("post-location").value = listing.location || "";
      document.getElementById("post-category").value = listing.category || "";
      document.getElementById("post-stock").value = getListingStock(listing) || 1;
      document.getElementById("post-allow-reservations").checked = listing.allowReservations !== false;
      if (meetUpToggle) meetUpToggle.checked = listing.meetUpAvailable !== false;
      if (deliveryToggle) deliveryToggle.checked = listing.deliveryAvailable !== false;
      const tradeToggle = document.getElementById("post-open-for-trade");
      const tradeForField = document.getElementById("post-trade-for-field");
      const tradeForInput = document.getElementById("post-trade-for");
      if (tradeToggle) { tradeToggle.checked = listing.openForTrade === true; }
      const secondHandToggle = document.getElementById("post-is-second-hand");
      if (secondHandToggle) secondHandToggle.checked = listing.isSecondHand === true;
      if (tradeForInput) tradeForInput.value = listing.tradeFor || "";
      if (tradeForField) tradeForField.style.display = listing.openForTrade ? "block" : "none";
      if (document.getElementById("post-gcash-number")) document.getElementById("post-gcash-number").value = "";
      if (document.getElementById("post-gcash-name")) document.getElementById("post-gcash-name").value = "";
      if (document.getElementById("post-maya-number")) document.getElementById("post-maya-number").value = "";
      if (document.getElementById("post-maya-name")) document.getElementById("post-maya-name").value = "";
      postImageState.dataUrl = listing.image || "";
      postImageState.fileName = listing.image ? "existing-image" : "";
    } else {
      heading.textContent = "Post an item";
      subheading.textContent = "Fill in the details below — it only takes a minute.";
      submitBtn.textContent = "Submit listing";
    }

    updatePostImagePreview();
  }

  const postImageInput = document.getElementById("post-image");
  if (postImageInput) {
    postImageInput.addEventListener("change", () => {
      const file = postImageInput.files && postImageInput.files[0];
      if (!file) {
        postImageState.dataUrl = "";
        postImageState.fileName = "";
        updatePostImagePreview();
        return;
      }
      if (!file.type || !file.type.startsWith("image/")) {
        showToast("Please choose an image file.");
        postImageInput.value = "";
        postImageState.dataUrl = "";
        postImageState.fileName = "";
        updatePostImagePreview();
        return;
      }
      if (file.size > MAX_POST_IMAGE_BYTES) {
        showToast("Image is too large. Please use a file under 1.5 MB.");
        postImageInput.value = "";
        postImageState.dataUrl = "";
        postImageState.fileName = "";
        updatePostImagePreview();
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        postImageState.dataUrl = String(reader.result || "");
        postImageState.fileName = file.name;
        updatePostImagePreview();
      };
      reader.onerror = () => {
        showToast("Could not read that image.");
        postImageInput.value = "";
        postImageState.dataUrl = "";
        postImageState.fileName = "";
        updatePostImagePreview();
      };
      reader.readAsDataURL(file);
    });
  }

  // ---------------------------------------------------------
  // Duplicate listing detection
  // Returns the most similar existing listing by the same seller, or null.
  // Similarity is determined by:
  //   1. Exact/near-exact title match (case-insensitive, ignoring punctuation), OR
  //   2. Same category + significant word overlap in title (≥60% of words match)
  // ---------------------------------------------------------
  function findSimilarSellerListing(sellerId, title, category) {
    const normalize = (str) =>
      (str || "").toLowerCase().replace(/[^a-z0-9\s]/g, "").trim();

    const words = (str) =>
      normalize(str).split(/\s+/).filter((w) => w.length > 2);

    const candidateTitle = normalize(title);
    const candidateWords = words(title);

    const sellerListings = DB.listings.filter(
      (l) => l.sellerId === sellerId && l.status !== "deleted"
    );

    for (const listing of sellerListings) {
      const existingTitle = normalize(listing.title);

      // Rule 1: near-identical title (one is substring of the other, or ≤2 chars apart)
      if (
        existingTitle === candidateTitle ||
        existingTitle.includes(candidateTitle) ||
        candidateTitle.includes(existingTitle)
      ) {
        return listing;
      }

      // Rule 2: same category + ≥60% word overlap
      if (listing.category === category && candidateWords.length > 0) {
        const existingWords = new Set(words(listing.title));
        const matchCount = candidateWords.filter((w) => existingWords.has(w)).length;
        const similarity = matchCount / candidateWords.length;
        if (similarity >= 0.6) {
          return listing;
        }
      }
    }

    return null;
  }

  // Shows the duplicate-listing warning modal with Edit / Boost / Post Anyway options.
  function showDuplicateListingModal(similarListing, onPostAnyway) {
    // Re-use the confirm-modal overlay but inject richer markup into modal-body
    const overlay = document.getElementById("confirm-modal");
    const iconEl = document.getElementById("modal-icon");
    const titleEl = document.getElementById("modal-title");
    const bodyEl = document.getElementById("modal-body");
    const confirmBtn = document.getElementById("modal-confirm-btn");
    const cancelBtn = document.getElementById("modal-cancel-btn");

    iconEl.className = "modal-icon modal-icon--warning";
    iconEl.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.7 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`;
    titleEl.textContent = "Possible duplicate detected";

    // Use innerHTML for the body so we can show the existing listing name
    bodyEl.innerHTML = `You already have a similar listing: <strong>${escapeHtml(similarListing.title)}</strong>.<br><br>Would you like to <strong>edit</strong> that post, <strong>boost</strong> it to the top, or post this as a new listing anyway?`;

    // Repurpose confirm button as "Edit existing"
    confirmBtn.textContent = "Edit existing listing";
    confirmBtn.className = "btn btn--forest";

    // Add a "Boost" button dynamically if not already there
    let boostBtn = document.getElementById("modal-boost-btn");
    if (!boostBtn) {
      boostBtn = document.createElement("button");
      boostBtn.id = "modal-boost-btn";
      boostBtn.className = "btn btn--outline";
      confirmBtn.parentNode.insertBefore(boostBtn, confirmBtn.nextSibling);
    }
    boostBtn.textContent = "Boost existing post";
    boostBtn.style.display = "";

    // Rename cancel button to "Post anyway"
    cancelBtn.textContent = "Post as new listing";
    cancelBtn.className = "btn btn--outline";

    overlay.hidden = false;

    function close() {
      overlay.hidden = true;
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      boostBtn.onclick = null;
      overlay.onclick = null;
      // Restore cancel button label for other uses
      cancelBtn.textContent = "Cancel";
      cancelBtn.className = "btn btn--outline";
      if (boostBtn) boostBtn.style.display = "none";
    }

    confirmBtn.onclick = () => {
      close();
      navigate(`#/post?edit=${similarListing.id}`);
    };

    boostBtn.onclick = () => {
      close();
      // Boost: update createdAt to now so it sorts to top
      const listing = DB.listings.find((l) => l.id === similarListing.id);
      if (listing) {
        listing.createdAt = Date.now();
        listing.boostedAt = Date.now();
        saveDB();
        showToast(`"${listing.title}" boosted to the top!`);
        navigate(`#/item/${listing.id}`);
      }
    };

    cancelBtn.onclick = () => {
      close();
      onPostAnyway && onPostAnyway();
    };

    overlay.onclick = (e) => {
      if (e.target === overlay) close();
    };
  }

  document.getElementById("form-post").addEventListener("submit", (e) => {
    e.preventDefault();
    if (!isAuthenticated()) {
      showToast("Please log in to post an item.");
      navigate("#/signin");
      return;
    }
    const title = document.getElementById("post-title").value.trim();
    const description = document.getElementById("post-description").value.trim();
    const price = document.getElementById("post-price").value;
    const location = document.getElementById("post-location").value.trim();
    const category = document.getElementById("post-category").value;
    const allowReservations = document.getElementById("post-allow-reservations").checked;
    const stockQuantity = Math.max(1, parseInt(document.getElementById("post-stock").value || "1", 10));
    const meetUpAvailable = document.getElementById("post-meetup-available").checked;
    const deliveryAvailable = document.getElementById("post-delivery-available").checked;
    const openForTrade = document.getElementById("post-open-for-trade")?.checked || false;
    const isSecondHand = document.getElementById("post-is-second-hand")?.checked || false;
    const tradeFor = (document.getElementById("post-trade-for")?.value || "").trim();
    const gcashNumber = "";
    const gcashName = "";
    const mayaNumber = "";
    const mayaName = "";
    const image = postImageState.dataUrl || postOriginalImage || createListingPlaceholder({ title, category });
    const moderationKeyword = findModerationKeyword(title, description);

    if (!title || !description || !price || !location || !category) return;
    if (!meetUpAvailable && !deliveryAvailable) {
      showToast("Choose at least one fulfillment option.");
      return;
    }

    const btn = document.getElementById("post-submit-btn");
    btn.disabled = true;
    btn.textContent = postEditingListingId ? "Saving..." : "Submitting...";

    setTimeout(() => {
      const seller = currentUser();
      if (postEditingListingId) {
        const listing = DB.listings.find((item) => item.id === postEditingListingId && item.sellerId === seller.id);
        if (!listing) {
          btn.disabled = false;
          btn.textContent = "Save changes";
          showToast("Could not update that listing.");
          return;
        }
        listing.title = title;
        listing.description = description;
        listing.price = Number(price).toFixed(2);
        listing.category = category;
        listing.location = location;
        listing.image = image;
        listing.allowReservations = allowReservations;
        listing.stockQuantity = stockQuantity;
        listing.meetUpAvailable = meetUpAvailable;
        listing.deliveryAvailable = deliveryAvailable;
        listing.openForTrade = openForTrade;
        listing.isSecondHand = isSecondHand;
        listing.tradeFor = tradeFor;
        listing.gcashNumber = gcashNumber;
        listing.gcashName = gcashName;
        listing.mayaNumber = mayaNumber;
        listing.mayaName = mayaName;
        ensureListingReviewFields(listing);

        if (moderationKeyword) {
          flagListingForReview(listing, moderationKeyword, "post", `Matched keyword: ${moderationKeyword}`);
          issueUserWarning(seller.id, `Auto-flagged edited listing for keyword "${moderationKeyword}".`, "post", listing.id);
          showToast(`Saved, but the post was flagged for review (${moderationKeyword}).`);
        } else {
          listing.reviewStatus = listing.reviewStatus === "reported" ? "reported" : "approved";
          if (!listing.flagged) listing.status = getListingStock(listing) > 0 ? "available" : "sold";
          saveDB();
          showToast("Listing updated!");
        }

        recordAudit("listing_updated", { listingId: listing.id, sellerId: seller.id, moderationKeyword });
        postEditingListingId = null;
        postOriginalImage = "";
        postImageState.dataUrl = "";
        postImageState.fileName = "";
        if (postImageInput) postImageInput.value = "";
        updatePostImagePreview();
        btn.disabled = false;
        btn.textContent = "Submit listing";
        navigate(moderationKeyword ? "#/admin" : `#/item/${listing.id}`);
        return;
      }

      // ── Duplicate detection (new listings only) ───────────────
      const similarListing = findSimilarSellerListing(seller.id, title, category);
      if (similarListing) {
        // Re-enable button first so UX is clean before modal appears
        btn.disabled = false;
        btn.textContent = "Submit listing";

        showDuplicateListingModal(similarListing, () => {
          // "Post as new listing anyway" — proceed with creation
          doCreateListing();
        });
        return;
      }

      doCreateListing();

      function doCreateListing() {
        const id = nextId("listings");
        const listing = {
          id,
          sellerId: seller.id,
          title,
          description,
          price: Number(price).toFixed(2),
          category,
          location,
          image,
          allowReservations,
          stockQuantity,
          meetUpAvailable,
          deliveryAvailable,
          openForTrade,
          isSecondHand,
          tradeFor,
          gcashNumber,
          gcashName,
          mayaNumber,
          mayaName,
          status: "available",
          createdAt: Date.now(),
          reviewStatus: "",
          flagged: false,
          matchedKeyword: "",
          hiddenReason: "",
          flagNotes: [],
          reportReasons: [],
          reportCount: 0,
        };

        DB.listings.push(listing);

        if (moderationKeyword) {
          flagListingForReview(listing, moderationKeyword, "post", `Matched keyword: ${moderationKeyword}`);
          issueUserWarning(seller.id, `Auto-flagged new listing for keyword "${moderationKeyword}".`, "post", listing.id);
          showToast(`Posted, but flagged for review (${moderationKeyword}).`);
        } else {
          saveDB();
          showToast("Listing posted!");
        }

        recordAudit("listing_created", { listingId: listing.id, sellerId: seller.id, moderationKeyword });
        postImageState.dataUrl = "";
        postImageState.fileName = "";
        postOriginalImage = "";
        if (postImageInput) postImageInput.value = "";
        updatePostImagePreview();
        btn.disabled = false;
        btn.textContent = "Submit listing";
        navigate(moderationKeyword ? "#/admin" : "#/browse");
      }
    }, 300);
  });

  // ---------------------------------------------------------
  // Screen: Reservation
  // ---------------------------------------------------------
  let reservationState = {
    paymentType: "downpayment",
    downpaymentPct: 50,
    paymentMethod: "gcash",
    eWalletProvider: "gcash",
    receivingMethod: "meetup",
    courier: "J&T Express",
    // card fields
    cardNumber: "",
    cardExpiry: "",
    cardCvv: "",
    cardName: "",
    // ewallet fields
    ewalletNumber: "",
    ewalletName: "",
  };

  const paymentScreenshotState = { dataUrl: "", fileName: "" };

  const COURIER_OPTIONS = ["J&T Express", "Flash Express", "2GO Express"];

  function renderReservation(listingId) {
    const layout = document.getElementById("reservation-layout");
    const backBtn = document.getElementById("reservation-back-btn");
    backBtn.onclick = () => navigate(`#/item/${listingId}`);

    const listing = getListing(listingId);

    if (!isAuthenticated()) {
      layout.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <p class="empty-state__title">Please log in</p>
          <p class="empty-state__sub">Sign in to reserve or buy this item.</p>
        </div>`;
      return;
    }

    if (!listing) {
      layout.innerHTML = `<div class="empty-state" style="grid-column:1/-1"><p class="empty-state__title">Loading...</p></div>`;
      return;
    }

    if (!isListingAvailable(listing) && !(currentUser().id === listing.sellerId)) {
      const label = listing.status === "sold" ? "already been sold" : "just been reserved by another buyer";
      layout.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <p class="empty-state__title">This item is no longer available</p>
          <p class="empty-state__sub">Sorry, this item has ${label}. Please check out similar listings instead.</p>
          <button class="btn btn--coral" style="margin-top:14px" id="reservation-unavailable-browse-btn">Browse other items</button>
        </div>`;
      document.getElementById("reservation-unavailable-browse-btn").addEventListener("click", () => navigate("#/browse"));
      return;
    }

    const maxStock = Math.max(1, getListingStock(listing));
    reservationState = {
      paymentType: "downpayment",
      downpaymentPct: 50,
      paymentMethod: "gcash",
      eWalletProvider: "gcash",
      paymentReference: "",
      receivingMethod: "meetup",
      courier: "J&T Express",
      quantity: Math.min(maxStock, reservationState.quantity || 1),
      cardNumber: "", cardExpiry: "", cardCvv: "", cardName: "", cardRef: "",
      ewalletNumber: "", ewalletName: "", ewalletRef: "",
    };

    const availableMethods = [];
    if (listing.meetUpAvailable !== false) availableMethods.push("meetup");
    if (listing.deliveryAvailable !== false) availableMethods.push("delivery");
    if (availableMethods.length === 0) availableMethods.push("meetup");
    if (!availableMethods.includes(reservationState.receivingMethod)) {
      reservationState.receivingMethod = availableMethods[0];
    }
    if (reservationState.receivingMethod === "delivery" && !COURIER_OPTIONS.includes(reservationState.courier)) {
      reservationState.courier = COURIER_OPTIONS[0];
    }

    function compute() {
      const unitPrice = parseFloat(listing.price);
      const quantity = Math.max(1, Math.min(maxStock, parseInt(reservationState.quantity || "1", 10) || 1));
      const itemSubtotal = unitPrice * quantity;
      const serviceFee = 10;
      let amountDue, remainingBalance;
      if (reservationState.paymentType === "full") {
        amountDue = itemSubtotal + serviceFee;
        remainingBalance = 0;
      } else {
        const dpAmount = Math.round(itemSubtotal * (reservationState.downpaymentPct / 100));
        amountDue = dpAmount + serviceFee;
        remainingBalance = itemSubtotal - dpAmount;
      }
      return { unitPrice, quantity, itemSubtotal, serviceFee, amountDue, remainingBalance };
    }

    function draw() {
      const { unitPrice, quantity, itemSubtotal, serviceFee, amountDue, remainingBalance } = compute();
      const methodButtons = [];
      if (listing.meetUpAvailable !== false) {
        methodButtons.push(`<button type="button" data-method="meetup" class="${reservationState.receivingMethod === "meetup" ? "active" : ""}">Meet-up</button>`);
      }
      if (listing.deliveryAvailable !== false) {
        methodButtons.push(`<button type="button" data-method="delivery" class="${reservationState.receivingMethod === "delivery" ? "active" : ""}">Delivery</button>`);
      }
      const courierBlock = reservationState.receivingMethod === "delivery" ? `
          <div class="section-block">
            <h3 class="section-title">Delivery courier</h3>
            <div class="courier-grid">
              ${COURIER_OPTIONS.map((courier) => `
                <button type="button" data-courier="${courier}" class="courier-chip ${reservationState.courier === courier ? "active" : ""}">${courier}</button>
              `).join("")}
            </div>
          </div>` : `
          <div class="section-block">
            <h3 class="section-title">Meet-up</h3>
            <p class="section-hint">Coordinate the meet-up location and time with the seller in chat.</p>
          </div>`;

      layout.innerHTML = `
        <div class="reservation-main">
          <div class="summary-card">
            ${listingImageMarkup(listing, "summary-card__img")}
            <div style="flex:1;min-width:0">
              <p class="summary-card__title">${escapeHtml(listing.title)}</p>
              <p class="summary-card__meta">Seller: ${escapeHtml(listing.seller?.name || "Unknown")} · ${escapeHtml(listing.location)}</p>
              <p class="summary-card__price">₱${unitPrice.toLocaleString()} each</p>
              <p class="summary-card__meta">${quantity} selected · ${itemSubtotal.toLocaleString()} item subtotal · ${maxStock} available</p>
            </div>
          </div>

          <div class="section-block">
            <h3 class="section-title">Quantity</h3>
            <div class="quantity-control">
              <button type="button" class="quantity-control__btn" data-qty-step="-1">−</button>
              <input type="number" id="reservation-quantity" min="1" max="${maxStock}" value="${quantity}" />
              <button type="button" class="quantity-control__btn" data-qty-step="1">+</button>
            </div>
            <p class="section-hint">You can reserve up to ${maxStock} ${maxStock === 1 ? "unit" : "units"}.</p>
          </div>

          <div class="section-block">
            <h3 class="section-title">Payment type</h3>
            <div class="toggle-pair">
              <button type="button" data-ptype="full" class="${reservationState.paymentType === "full" ? "active" : ""}">Full payment</button>
              <button type="button" data-ptype="downpayment" class="${reservationState.paymentType === "downpayment" ? "active" : ""}">Downpayment</button>
            </div>
            <p class="section-hint">${reservationState.paymentType === "full"
              ? "Pay the full amount now and arrange pickup or delivery with the seller."
              : "A downpayment secures this item for 24 hours. Pay the remainder on meetup."}</p>
          </div>

          ${reservationState.paymentType === "downpayment" ? `
          <div class="section-block">
            <h3 class="section-title">Downpayment</h3>
            <div class="toggle-pair toggle-pair--dp">
              ${[20, 50, 100].map((pct) => `<button type="button" data-dp="${pct}" class="${reservationState.downpaymentPct === pct ? "active" : ""}">${pct}%</button>`).join("")}
            </div>
          </div>` : ""}

          <div class="section-block">
            <h3 class="section-title">How will you get it?</h3>
            <div class="toggle-pair toggle-pair--fulfillment">${methodButtons.join("")}</div>
            <p class="section-hint">${reservationState.receivingMethod === "delivery" ? "Choose a courier before confirming your order." : "Meet-up will be arranged directly with the seller."}</p>
          </div>

          ${courierBlock}

          <div class="section-block">
            <h3 class="section-title">Payment method</h3>
            ${(reservationState.paymentMethod === "gcash" || reservationState.paymentMethod === "maya") && (() => {
              const provider = reservationState.eWalletProvider || "gcash";
              const num = provider === "maya" ? listing.mayaNumber : listing.gcashNumber;
              const name = provider === "maya" ? listing.mayaName : listing.gcashName;
              if (!num && !name) return "";
              return `<div class="seller-payment-info">
                <span class="seller-payment-info__label">${ICONS.shieldCheck} Send payment to seller's ${provider === "maya" ? "Maya" : "GCash"}:</span>
                <div class="seller-payment-info__details">
                  ${num ? `<span class="seller-payment-info__number">${escapeHtml(num)}</span>` : ""}
                  ${name ? `<span class="seller-payment-info__name">${escapeHtml(name)}</span>` : ""}
                </div>
              </div>`;
            })()}
            <div class="paymethod-list">
              ${[
                { id: "ewallet", label: "E-Wallet", icon: "smartphoneText", color: "#007EFE" },
                { id: "card", label: "Credit / Debit Card", icon: "creditCard", color: "#1F4D3D" },
                { id: "cash", label: "Cash on meetup", icon: "banknote", color: "#FF6B4A" },
              ].map((m) => {
                const isActive = m.id === "ewallet"
                  ? (reservationState.paymentMethod === "gcash" || reservationState.paymentMethod === "maya")
                  : reservationState.paymentMethod === m.id;
                const extraClass = (m.id === "ewallet" && isActive) ? " paymethod--ewallet-open" : "";
                return `
                <label class="paymethod ${isActive ? "active" : ""}${extraClass}" data-pmethod="${m.id}">
                  <span class="paymethod__icon" style="background:${m.color}">${ICONS[m.icon] ? ICONS[m.icon] : escapeHtml(m.icon)}</span>
                  <span class="paymethod__label">${m.label}</span>
                  <span class="paymethod__radio">${isActive ? ICONS.check : ""}</span>
                </label>
                ${m.id === "ewallet" && isActive ? `
                <div class="ewallet-picker">
                  <p class="ewallet-picker__label">Choose your e-wallet</p>
                  <div class="ewallet-picker__options">
                    ${[
                      { id: "gcash", label: "GCash", icon: "G", color: "#007EFE", sub: "Send money instantly" },
                      { id: "maya", label: "Maya", icon: "M", color: "#6FDB44", sub: "Pay with Maya" },
                    ].map((ew) => `
                      <label class="ewallet-option ${reservationState.eWalletProvider === ew.id ? "active" : ""}" data-ewprovider="${ew.id}">
                        <span class="ewallet-option__icon" style="background:${ew.color}">${ew.icon}</span>
                        <span class="ewallet-option__text">
                          <span class="ewallet-option__name">${ew.label}</span>
                          <span class="ewallet-option__sub">${ew.sub}</span>
                        </span>
                        <span class="ewallet-option__radio">${reservationState.eWalletProvider === ew.id ? ICONS.check : ""}</span>
                      </label>
                    `).join("")}
                  </div>
                </div>` : ""}
              `}).join("")}
            </div>
            ${reservationState.paymentMethod !== "cash" ? `
            <div style="margin-top:14px">
            ${reservationState.paymentMethod === "card" ? `
              <div class="card-security-banner">
                ${ICONS.shieldCheck} <span>Your card details are protected.</span>
              </div>
              <p class="card-security-sub">We do not store your full card details. Your info is encrypted and used only to verify this transaction.</p>
              <div class="card-form">
                <div class="field">
                  <label>Card Number</label>
                  <input type="text" id="card-number" inputmode="numeric" maxlength="19" placeholder="0000 0000 0000 0000" value="${escapeHtml(reservationState.cardNumber || "")}" autocomplete="cc-number" />
                  <p class="field-error" id="card-number-error"></p>
                </div>
                <div class="card-form-row">
                  <div class="field">
                    <label>Expiry Date</label>
                    <input type="text" id="card-expiry" inputmode="numeric" maxlength="5" placeholder="MM/YY" value="${escapeHtml(reservationState.cardExpiry || "")}" autocomplete="cc-exp" />
                    <p class="field-error" id="card-expiry-error"></p>
                  </div>
                  <div class="field">
                    <label>CVV <span class="cvv-hint" id="cvv-tooltip-btn" title="The 3-digit security code on the back of your card (4 digits for Amex).">?</span></label>
                    <input type="password" id="card-cvv" inputmode="numeric" maxlength="4" placeholder="•••" value="${escapeHtml(reservationState.cardCvv || "")}" autocomplete="cc-csc" />
                    <p class="field-error" id="card-cvv-error"></p>
                  </div>
                </div>
                <div class="field">
                  <label>Name</label>
                  <input type="text" id="card-name" placeholder="Name on card" value="${escapeHtml(reservationState.cardName || "")}" autocomplete="cc-name" />
                  <p class="field-error" id="card-name-error"></p>
                </div>
                <div class="field">
                  <label>Approval / Reference Code <span style="color:#888;font-weight:400;font-size:12px">(from your bank SMS or app)</span></label>
                  <input type="text" id="card-ref" maxlength="20" placeholder="e.g. 987654" value="${escapeHtml(reservationState.cardRef || "")}" />
                  <p class="field-error" id="card-ref-error"></p>
                </div>
                <p class="section-hint">₱1.00 will be deducted as a verification fee and refunded within 14 days.</p>
              </div>
            ` : `
              <div class="card-security-banner">
                ${ICONS.shieldCheck} <span>Your details are protected.</span>
              </div>
              <div class="card-form">
                <div class="field">
                  <label>${reservationState.eWalletProvider === "maya" ? "Maya" : "GCash"} Number</label>
                  <input type="text" id="ewallet-number" inputmode="numeric" maxlength="11" placeholder="09XXXXXXXXX" value="${escapeHtml(reservationState.ewalletNumber || "")}" autocomplete="tel" />
                  <p class="field-error" id="ewallet-number-error"></p>
                </div>
                <div class="field">
                  <label>Name</label>
                  <input type="text" id="ewallet-name" placeholder="Name on ${reservationState.eWalletProvider === "maya" ? "Maya" : "GCash"} account" value="${escapeHtml(reservationState.ewalletName || "")}" autocomplete="name" />
                  <p class="field-error" id="ewallet-name-error"></p>
                </div>
                <div class="field">
                  <label>Reference Number <span style="color:#888;font-weight:400;font-size:12px">(from your ${reservationState.eWalletProvider === "maya" ? "Maya" : "GCash"} transaction)</span></label>
                  <input type="text" id="ewallet-ref" inputmode="numeric" maxlength="20" placeholder="e.g. 123456789012" value="${escapeHtml(reservationState.ewalletRef || "")}" />
                  <p class="field-error" id="ewallet-ref-error"></p>
                </div>
                <div class="field">
                  <label>Payment screenshot <span style="color:#888;font-weight:400;font-size:12px">(required)</span></label>
                  <input type="file" id="payment-screenshot" accept="image/*" />
                  <p class="field-error" id="payment-screenshot-error"></p>
                  <div id="payment-screenshot-preview" class="payment-screenshot-preview">${paymentScreenshotState.dataUrl ? `<img src="${escapeHtml(paymentScreenshotState.dataUrl)}" alt="Payment screenshot" />` : ""}</div>
                </div>
                <p class="section-hint">${ICONS.shieldCheck || ""} We verify this with the seller before confirming your reservation.</p>
              </div>
            `}
            </div>` : `
            <p class="section-hint">${ICONS.shieldCheck || ""} You'll pay the seller directly when you meet up — no online payment needed now.</p>
            `}
          </div>
        </div>

        <div class="reservation-summary">
          <div class="breakdown-row"><span>Item subtotal</span><span>₱${itemSubtotal.toLocaleString()}.00</span></div>
          <div class="breakdown-row"><span>Quantity</span><span>${quantity}</span></div>
          <div class="breakdown-row"><span>Service fee</span><span>₱${serviceFee.toFixed(2)}</span></div>
          <div class="breakdown-row"><span>Receiving method</span><span>${reservationState.receivingMethod === "delivery" ? "Delivery" : "Meet-up"}</span></div>
          ${reservationState.receivingMethod === "delivery" ? `<div class="breakdown-row"><span>Courier</span><span>${escapeHtml(reservationState.courier)}</span></div>` : ""}
          <div class="breakdown-divider"></div>
          <div class="breakdown-total">
            <span>${reservationState.paymentType === "full" ? "Total due now" : `Downpayment (${reservationState.downpaymentPct}%) + fee`}</span>
            <span>₱${amountDue.toLocaleString()}.00</span>
          </div>
          ${remainingBalance > 0 ? `
          <div class="breakdown-divider"></div>
          <div class="breakdown-row" style="margin-bottom:0"><span>Balance on meetup</span><span>₱${remainingBalance.toLocaleString()}.00</span></div>
          ` : ""}
          <p class="section-hint" style="margin-bottom:14px">${ICONS.shieldCheck || ICONS.shield} Your order will be sent to the seller for confirmation before it's finalized — you won't be charged again, and the item stays reserved for you while you wait.</p>
          <button class="btn btn--coral btn--lg" id="reservation-confirm-btn">${reservationState.paymentType === "full" ? "Submit payment for review" : "Submit reservation for review"}</button>
          <button class="btn btn--outline" id="reservation-cancel-btn">Cancel</button>
        </div>
      `;

      layout.querySelectorAll("[data-ptype]").forEach((btn) => {
        btn.addEventListener("click", () => {
          reservationState.paymentType = btn.getAttribute("data-ptype");
          draw();
        });
      });
      layout.querySelectorAll("[data-dp]").forEach((btn) => {
        btn.addEventListener("click", () => {
          reservationState.downpaymentPct = parseInt(btn.getAttribute("data-dp"), 10);
          draw();
        });
      });
      layout.querySelectorAll("[data-method]").forEach((btn) => {
        btn.addEventListener("click", () => {
          reservationState.receivingMethod = btn.getAttribute("data-method");
          if (reservationState.receivingMethod === "delivery" && !COURIER_OPTIONS.includes(reservationState.courier)) {
            reservationState.courier = COURIER_OPTIONS[0];
          }
          draw();
        });
      });
      layout.querySelectorAll("[data-courier]").forEach((btn) => {
        btn.addEventListener("click", () => {
          reservationState.courier = btn.getAttribute("data-courier");
          draw();
        });
      });
      layout.querySelectorAll("[data-pmethod]").forEach((label) => {
        label.addEventListener("click", () => {
          const method = label.getAttribute("data-pmethod");
          if (method === "ewallet") {
            reservationState.paymentMethod = reservationState.eWalletProvider || "gcash";
          } else {
            reservationState.paymentMethod = method;
          }
          reservationState.paymentReference = "";
          reservationState.ewalletRef = "";
          paymentScreenshotState.dataUrl = "";
          paymentScreenshotState.fileName = "";
          draw();
        });
      });
      layout.querySelectorAll("[data-ewprovider]").forEach((label) => {
        label.addEventListener("click", (e) => {
          e.stopPropagation();
          const provider = label.getAttribute("data-ewprovider");
          reservationState.eWalletProvider = provider;
          reservationState.paymentMethod = provider;
          reservationState.paymentReference = "";
          draw();
        });
      });
      const qtyInput = document.getElementById("reservation-quantity");
      if (qtyInput) {
        qtyInput.addEventListener("input", (e) => {
          const nextQty = Math.max(1, Math.min(maxStock, parseInt(e.target.value || "1", 10) || 1));
          reservationState.quantity = nextQty;
          if (String(nextQty) !== e.target.value) e.target.value = String(nextQty);
          draw();
        });
      }
      layout.querySelectorAll("[data-qty-step]").forEach((btn) => {
        btn.addEventListener("click", () => {
          const step = parseInt(btn.getAttribute("data-qty-step"), 10);
          reservationState.quantity = Math.max(1, Math.min(maxStock, (reservationState.quantity || 1) + step));
          draw();
        });
      });
      // Card field listeners
      const cardNumberInput = document.getElementById("card-number");
      if (cardNumberInput) {
        cardNumberInput.addEventListener("input", (e) => {
          let v = e.target.value.replace(/\D/g, "").slice(0, 16);
          e.target.value = v.replace(/(.{4})/g, "$1 ").trim();
          reservationState.cardNumber = e.target.value;
        });
      }
      const cardExpiryInput = document.getElementById("card-expiry");
      if (cardExpiryInput) {
        cardExpiryInput.addEventListener("input", (e) => {
          let v = e.target.value.replace(/\D/g, "").slice(0, 4);
          if (v.length >= 3) v = v.slice(0, 2) + "/" + v.slice(2);
          e.target.value = v;
          reservationState.cardExpiry = e.target.value;
        });
      }
      const cardCvvInput = document.getElementById("card-cvv");
      if (cardCvvInput) {
        cardCvvInput.addEventListener("input", (e) => {
          reservationState.cardCvv = e.target.value.replace(/\D/g, "").slice(0, 4);
          e.target.value = reservationState.cardCvv;
        });
      }
      const cardNameInput = document.getElementById("card-name");
      if (cardNameInput) {
        cardNameInput.addEventListener("input", (e) => { reservationState.cardName = e.target.value; });
      }
      const cardRefInput = document.getElementById("card-ref");
      if (cardRefInput) {
        cardRefInput.addEventListener("input", (e) => { reservationState.cardRef = e.target.value.trim(); });
      }
      // CVV tooltip
      const cvvBtn = document.getElementById("cvv-tooltip-btn");
      if (cvvBtn) {
        cvvBtn.addEventListener("click", (e) => {
          e.stopPropagation();
          let tip = document.getElementById("cvv-tooltip-popup");
          if (tip) { tip.remove(); return; }
          tip = document.createElement("div");
          tip.id = "cvv-tooltip-popup";
          tip.className = "cvv-tooltip-popup";
          tip.innerHTML = `<strong>What is CVV?</strong><p>The 3-digit code on the back of your card (Visa/Mastercard). For Amex, it's 4 digits on the front.</p>`;
          cvvBtn.parentElement.style.position = "relative";
          cvvBtn.parentElement.appendChild(tip);
          const close = (ev) => { if (!tip.contains(ev.target) && ev.target !== cvvBtn) { tip.remove(); document.removeEventListener("click", close); } };
          setTimeout(() => document.addEventListener("click", close), 0);
        });
      }
      // E-wallet field listeners
      const ewalletNumInput = document.getElementById("ewallet-number");
      if (ewalletNumInput) {
        ewalletNumInput.addEventListener("input", (e) => {
          reservationState.ewalletNumber = e.target.value.replace(/\D/g, "").slice(0, 11);
          e.target.value = reservationState.ewalletNumber;
        });
      }
      const ewalletNameInput = document.getElementById("ewallet-name");
      if (ewalletNameInput) {
        ewalletNameInput.addEventListener("input", (e) => { reservationState.ewalletName = e.target.value; });
      }
      const ewalletRefInput = document.getElementById("ewallet-ref");
      if (ewalletRefInput) {
        ewalletRefInput.addEventListener("input", (e) => {
          reservationState.ewalletRef = e.target.value.replace(/\D/g, "").slice(0, 20);
          e.target.value = reservationState.ewalletRef;
        });
      }
      const screenshotInput = document.getElementById("payment-screenshot");
      if (screenshotInput) {
        screenshotInput.addEventListener("change", () => {
          const file = screenshotInput.files && screenshotInput.files[0];
          const errEl = document.getElementById("payment-screenshot-error");
          const preview = document.getElementById("payment-screenshot-preview");
          if (!file) { paymentScreenshotState.dataUrl = ""; paymentScreenshotState.fileName = ""; if (preview) preview.innerHTML = ""; return; }
          if (!file.type.startsWith("image/")) { if (errEl) errEl.textContent = "Please upload an image file."; screenshotInput.value = ""; return; }
          if (file.size > 3 * 1024 * 1024) { if (errEl) errEl.textContent = "File too large. Max 3MB."; screenshotInput.value = ""; return; }
          const reader = new FileReader();
          reader.onload = () => {
            paymentScreenshotState.dataUrl = String(reader.result || "");
            paymentScreenshotState.fileName = file.name;
            if (preview) preview.innerHTML = `<img src="${escapeHtml(paymentScreenshotState.dataUrl)}" alt="Payment screenshot preview" />`;
            if (errEl) errEl.textContent = "";
          };
          reader.readAsDataURL(file);
        });
      }

      document.getElementById("reservation-cancel-btn").addEventListener("click", () => navigate(`#/item/${listingId}`));
      document.getElementById("reservation-confirm-btn").addEventListener("click", () => {
        const freshListing = getListing(listingId);
        if (!isListingAvailable(freshListing)) {
          showToast("Sorry, this item was just reserved by another buyer.");
          renderReservation(listingId);
          return;
        }

        if (reservationState.paymentMethod === "card") {
          let ok = true;
          const cardNum = (reservationState.cardNumber || "").replace(/\s/g, "");
          const cardExp = (reservationState.cardExpiry || "").trim();
          const cardCvv = (reservationState.cardCvv || "").trim();
          const cardName = (reservationState.cardName || "").trim();
          const numErr = document.getElementById("card-number-error");
          const expErr = document.getElementById("card-expiry-error");
          const cvvErr = document.getElementById("card-cvv-error");
          const nameErr = document.getElementById("card-name-error");
          if (numErr) numErr.textContent = "";
          if (expErr) expErr.textContent = "";
          if (cvvErr) cvvErr.textContent = "";
          if (nameErr) nameErr.textContent = "";
          if (!cardNum || cardNum.length < 13) { if (numErr) numErr.textContent = "Please enter a valid card number."; document.getElementById("card-number")?.focus(); ok = false; }
          if (ok && (!cardExp || !/^\d{2}\/\d{2}$/.test(cardExp))) { if (expErr) expErr.textContent = "Enter expiry as MM/YY."; document.getElementById("card-expiry")?.focus(); ok = false; }
          if (ok && (!cardCvv || cardCvv.length < 3)) { if (cvvErr) cvvErr.textContent = "Enter your 3 or 4 digit CVV."; document.getElementById("card-cvv")?.focus(); ok = false; }
          if (ok && !cardName) { if (nameErr) nameErr.textContent = "Please enter the name on the card."; document.getElementById("card-name")?.focus(); ok = false; }
          if (!ok) return;
          const cardRefVal = (reservationState.cardRef || "").trim();
          const cardRefErr = document.getElementById("card-ref-error");
          if (cardRefErr) cardRefErr.textContent = "";
          if (!cardRefVal) { if (cardRefErr) cardRefErr.textContent = "Please enter your approval or reference code."; document.getElementById("card-ref")?.focus(); ok = false; }
          if (!ok) return;
          reservationState.paymentReference = `Card ending ${cardNum.slice(-4)} · Ref: ${cardRefVal}`;
        } else if (reservationState.paymentMethod === "gcash" || reservationState.paymentMethod === "maya") {
          let ok = true;
          const ewNum = (reservationState.ewalletNumber || "").trim();
          const ewName = (reservationState.ewalletName || "").trim();
          const ewRef = (reservationState.ewalletRef || "").trim();
          const numErr = document.getElementById("ewallet-number-error");
          const nameErr = document.getElementById("ewallet-name-error");
          const refErr = document.getElementById("ewallet-ref-error");
          if (numErr) numErr.textContent = "";
          if (nameErr) nameErr.textContent = "";
          if (refErr) refErr.textContent = "";
          if (!ewNum || ewNum.length < 10) { if (numErr) numErr.textContent = "Please enter a valid mobile number."; document.getElementById("ewallet-number")?.focus(); ok = false; }
          if (ok && !ewName) { if (nameErr) nameErr.textContent = "Please enter the account name."; document.getElementById("ewallet-name")?.focus(); ok = false; }
          if (ok && !ewRef) { if (refErr) refErr.textContent = "Please enter your transaction reference number."; document.getElementById("ewallet-ref")?.focus(); ok = false; }
          if (ok && !paymentScreenshotState.dataUrl) {
            const ssErr = document.getElementById("payment-screenshot-error");
            if (ssErr) ssErr.textContent = "Please upload a screenshot of your payment.";
            document.getElementById("payment-screenshot")?.focus();
            ok = false;
          }
          if (!ok) return;
          reservationState.paymentReference = `${reservationState.paymentMethod.toUpperCase()} · ${ewNum} (${ewName}) · Ref: ${ewRef}`;
        }

        const confirmBtn = document.getElementById("reservation-confirm-btn");
        confirmBtn.disabled = true;
        confirmBtn.textContent = reservationState.paymentMethod === "cash" ? "Submitting..." : "Verifying payment...";

        setTimeout(() => {
          const { unitPrice, quantity, itemSubtotal, serviceFee, amountDue, remainingBalance } = compute();
          const result = createReservation({
            buyerId: currentUser().id,
            listingId: listing.id,
            quantity,
            paymentType: reservationState.paymentType,
            downpaymentPercentage: reservationState.paymentType === "downpayment" ? reservationState.downpaymentPct : undefined,
            itemPrice: itemSubtotal.toFixed(2),
            amountPaid: amountDue.toFixed(2),
            remainingBalance: remainingBalance.toFixed(2),
            serviceFee: serviceFee.toFixed(2),
            paymentMethod: reservationState.paymentMethod,
            paymentReference: reservationState.paymentMethod !== "cash" ? reservationState.paymentReference.trim() : null,
            paymentScreenshot: paymentScreenshotState.dataUrl || null,
            receivingMethod: reservationState.receivingMethod,
            courier: reservationState.receivingMethod === "delivery" ? reservationState.courier : null,
          });
          paymentScreenshotState.dataUrl = "";
          paymentScreenshotState.fileName = "";

          const params = new URLSearchParams();
          params.set("ref", result.referenceNumber);
          params.set("amount", result.amountPaid);
          params.set("balance", result.remainingBalance);
          params.set("quantity", String(quantity));
          params.set("reservationId", String(result.id));
          if (result.conversationId) params.set("conversationId", result.conversationId);

          navigate(`#/confirmation?${params.toString()}`);
        }, 900);
      });
    }

    draw();
  }

  // ---------------------------------------------------------
  // Screen: Confirmation
  // ---------------------------------------------------------
  function renderConfirmation(qs) {
    const referenceNumber = qs.get("ref") || "LC-000000";
    const amountPaid = parseFloat(qs.get("amount") || "0");
    const remainingBalance = parseFloat(qs.get("balance") || "0");
    const quantity = parseInt(qs.get("quantity") || "1", 10) || 1;
    const conversationId = qs.get("conversationId");
    const reservationId = parseInt(qs.get("reservationId") || "0", 10);
    const reservation = normalizeReservation(getReservation(reservationId)) || DB.reservations.find((r) => r.referenceNumber === referenceNumber) || null;
    const isFullPayment = remainingBalance === 0;

    document.getElementById("confirmation-page").innerHTML = `
      <div class="confirm-icon confirm-icon--pending">${ICONS.package}</div>
      <h2 class="confirm-heading">Order submitted — waiting for seller</h2>
      <p class="confirm-sub">${isFullPayment
        ? "We\'ve recorded your payment and sent it to the seller for confirmation. The item is held for you and won\'t be shown to other buyers while you wait."
        : "We\'ve recorded your downpayment and sent it to the seller for confirmation. The item is held for you and won\'t be shown to other buyers while you wait."}</p>
      <div class="confirm-card">
        <div class="breakdown-row"><span>Reference no.</span><span style="font-family:monospace;font-weight:600;color:#2A2724">${escapeHtml(referenceNumber)}</span></div>
        <div class="breakdown-row"><span>Quantity</span><span style="font-weight:600;color:#2A2724">${quantity}</span></div>
        <div class="breakdown-row"><span>Amount paid</span><span style="font-weight:600;color:#2A2724">₱${amountPaid.toLocaleString()}.00</span></div>
        ${reservation ? `<div class="breakdown-row"><span>Receiving method</span><span style="font-weight:600;color:#2A2724">${reservation.receivingMethod === "delivery" ? "Delivery" : "Meet-up"}</span></div>` : ""}
        ${reservation?.courier ? `<div class="breakdown-row"><span>Courier</span><span style="font-weight:600;color:#2A2724">${escapeHtml(reservation.courier)}</span></div>` : ""}
        ${reservation?.paymentReference ? `<div class="breakdown-row"><span>Payment ref.</span><span style="font-family:monospace;font-weight:600;color:#2A2724">${escapeHtml(reservation.paymentReference)}</span></div>` : ""}
        ${!isFullPayment ? `<div class="breakdown-row" style="margin-bottom:0"><span>Balance on meetup</span><span style="font-weight:600;color:#2A2724">₱${remainingBalance.toLocaleString()}.00</span></div>` : ""}
      </div>
      <p class="section-hint" style="margin-bottom:18px">${ICONS.shieldCheck} The seller has a few hours to confirm your order. You\'ll get a chat notification either way — if they decline, your reservation is cancelled and the item reopens.</p>
      <button class="btn btn--coral" id="confirmation-message-btn">Message seller</button>
      <button class="btn btn--forest" id="confirmation-tracker-btn">View order tracker</button>
      <button class="btn btn--outline" id="confirmation-home-btn">Back to home</button>
    `;
    document.getElementById("confirmation-message-btn").addEventListener("click", () => {
      navigate(conversationId ? `#/chat/${conversationId}` : "#/home");
    });
    document.getElementById("confirmation-tracker-btn").addEventListener("click", () => {
      navigate(`#/orders?reservationId=${reservationId}`);
    });
    document.getElementById("confirmation-home-btn").addEventListener("click", () => navigate("#/home"));
  }

  // ---------------------------------------------------------
  // Screen: Profile
  // ---------------------------------------------------------
  let profileRole = "buyer";

  function renderProfile() {
    const sidebar = document.getElementById("profile-sidebar");
    const body = document.getElementById("profile-body");
    const user = currentUser();

    if (!user) {
      sidebar.innerHTML = "";
      body.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">Please log in</p>
          <p class="empty-state__sub">Sign in to view your profile.</p>
        </div>`;
      return;
    }

    const myListingsCount = DB.reservations.filter((r) => {
      const listing = getListing(r.listingId);
      return listing?.sellerId === user.id && (r.status === "completed" || r.trackingStatus === "Completed");
    }).reduce((sum, r) => sum + Math.max(1, r.quantity || 1), 0);
    const myReservationsCount = DB.reservations.filter((r) => r.buyerId === user.id && (r.status === "completed" || r.trackingStatus === "Completed")).reduce((sum, r) => sum + Math.max(1, r.quantity || 1), 0);
    const unreadCount = countUnreadMessages();
    const isAdmin = user.role === "admin";

    // Shopee-style: sidebar holds the profile card, body holds the content
    sidebar.innerHTML = `
      <div class="profile-me-card">
        <div class="profile-me-card__top">
          <div class="avatar avatar--lg">${initials(user.name)}</div>
          <div class="profile-me-card__info">
            <h2 class="profile-me-card__name font-fraunces">${escapeHtml(user.name)}</h2>
            <div class="location-badge">${ICONS.mapPin} ${escapeHtml(user.barangay || "Barangay")}</div>
          </div>
          <button class="profile-me-settings-btn" id="profile-settings-btn" title="Settings">${ICONS.settings}</button>
        </div>
        <div class="profile-me-stats">
          <div class="profile-me-stat"><span class="profile-me-stat__val">${myReservationsCount}</span><span class="profile-me-stat__label">Bought</span></div>
          <div class="profile-me-stat"><span class="profile-me-stat__val">${myListingsCount}</span><span class="profile-me-stat__label">Sold</span></div>
          <div class="profile-me-stat"><span class="profile-me-stat__val">4.8★</span><span class="profile-me-stat__label">Rating</span></div>
        </div>
      </div>

      <!-- My Purchases quick-nav -->
      <div class="profile-section-card">
        <div class="profile-section-card__header">
          <span class="profile-section-card__title">My Purchases</span>
          <button class="profile-section-card__link" id="profile-orders-btn">View History ›</button>
        </div>
        <div class="profile-purchase-row">
          <button class="profile-purchase-item" id="profile-topay-btn">
            ${ICONS.creditCard}
            <span>To Pay</span>
          </button>
          <button class="profile-purchase-item" id="profile-toship-btn">
            ${ICONS.package}
            <span>To Ship</span>
          </button>
          <button class="profile-purchase-item" id="profile-toreceive-btn">
            ${ICONS.shoppingCart}
            <span>To Receive</span>
          </button>
          <button class="profile-purchase-item" id="profile-torate-btn">
            ${ICONS.checkCircleSm}
            <span>Completed</span>
          </button>
        </div>
      </div>

      <!-- Menu list -->
      <div class="profile-section-card">
        <button class="menu-item${profileRole === "seller" ? " menu-item--active" : ""}" id="profile-listings-btn">
          <span class="menu-item__left">${ICONS.package} My Listings</span>
          <span class="menu-item__chevron">›</span>
        </button>
        <button class="menu-item" id="profile-saved-btn">
          <span class="menu-item__left">${ICONS.bookmark} Saved Items</span>
          <span class="menu-item__chevron">›</span>
        </button>
        <button class="menu-item" id="profile-messages-btn">
          <span class="menu-item__left">${ICONS.messageCircle} Messages${unreadCount > 0 ? ` <span class="menu-item__badge">${unreadCount > 9 ? "9+" : unreadCount}</span>` : ""}</span>
          <span class="menu-item__chevron">›</span>
        </button>
        <button class="menu-item" id="profile-trade-btn">
          <span class="menu-item__left">${ICONS.recycle} My Trade Requests</span>
          <span class="menu-item__chevron">›</span>
        </button>
        ${isAdmin ? `
        <button class="menu-item" id="profile-admin-btn">
          <span class="menu-item__left">${ICONS.shieldCheck} Admin Dashboard</span>
          <span class="menu-item__chevron">›</span>
        </button>` : ""}
      </div>

      <!-- Support section -->
      <div class="profile-section-card">
        <p class="profile-section-label">Support</p>
        <button class="menu-item" id="profile-helpcenter-btn">
          <span class="menu-item__left">${ICONS.messageCircle} Help Centre</span>
          <span class="menu-item__chevron">›</span>
        </button>
        <button class="menu-item" id="profile-customerservice-btn">
          <span class="menu-item__left">${ICONS.bell} Customer Service</span>
          <span class="menu-item__chevron">›</span>
        </button>
      </div>

      <!-- Logout -->
      <div class="profile-section-card">
        <button class="menu-item menu-item--danger" id="profile-logout-btn">
          <span class="menu-item__left">${ICONS.logOut} Log Out</span>
          <span class="menu-item__chevron">›</span>
        </button>
      </div>
    `;

    const mySellerListings = DB.listings
      .filter((l) => l.sellerId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((l) => ({ ...l, seller: user }));
    const myBuyerReservations = DB.reservations
      .filter((r) => r.buyerId === user.id)
      .sort((a, b) => b.createdAt - a.createdAt);

    if (profileRole === "seller") {
      body.innerHTML = `
        <div class="dashboard-card">
          <h2 class="section-heading">My listings</h2>
          <div class="listing-grid" id="profile-listings-grid"></div>
        </div>`;
      renderListingCardsInto(
        document.getElementById("profile-listings-grid"),
        mySellerListings,
        "You haven\'t posted any items yet.",
        true
      );
    } else {
      body.innerHTML = `
        <div class="dashboard-card">
          <h2 class="section-heading">My reservations</h2>
          <div id="profile-reservations-list"></div>
        </div>`;
      const list = document.getElementById("profile-reservations-list");
      if (myBuyerReservations.length === 0) {
        list.innerHTML = `
          <div class="empty-state">
            <p class="empty-state__title">No reservations yet</p>
            <p class="empty-state__sub">Items you reserve or buy will show up here.</p>
          </div>`;
      } else {
        list.innerHTML = "";
        myBuyerReservations.forEach((r) => {
          const listing = getListing(r.listingId);
          const row = document.createElement("div");
          row.className = "convo-card";
          row.innerHTML = `
            ${listingImageMarkup(listing, "listing-card__img", "width:56px;height:56px;border-radius:10px;flex-shrink:0")}
            <div class="convo-card__body">
              <div class="convo-card__top">
                <p class="convo-card__name">${escapeHtml(listing?.title || "Item")}</p>
                <span class="convo-card__time">${timeAgo(r.createdAt)}</span>
              </div>
              <p class="convo-card__item">Qty: ${r.quantity || 1} · Ref: ${escapeHtml(r.referenceNumber)} · ₱${Number(r.amountPaid).toLocaleString()} paid</p>
            </div>`;
          list.appendChild(row);
        });
      }
    }

    // Wire buttons
    document.getElementById("profile-settings-btn").addEventListener("click", () => navigate("#/settings"));
    document.getElementById("profile-listings-btn").addEventListener("click", () => {
      profileRole = "seller";
      renderProfile();
      const body = document.getElementById("profile-body");
      if (body) body.scrollIntoView({ behavior: "smooth", block: "start" });
    });
    document.getElementById("profile-saved-btn").addEventListener("click", () => navigate("#/saved"));
    document.getElementById("profile-messages-btn").addEventListener("click", () => navigate("#/inbox"));
    document.getElementById("profile-orders-btn").addEventListener("click", () => navigate("#/orders"));
    document.getElementById("profile-topay-btn").addEventListener("click", () => navigate("#/orders?sub=topay"));
    document.getElementById("profile-toship-btn").addEventListener("click", () => navigate("#/orders?sub=toship"));
    document.getElementById("profile-toreceive-btn").addEventListener("click", () => navigate("#/orders?sub=toreceive"));
    document.getElementById("profile-torate-btn").addEventListener("click", () => navigate("#/orders?sub=completed"));
    document.getElementById("profile-trade-btn").addEventListener("click", () => navigate("#/mytrades"));
    document.getElementById("profile-helpcenter-btn").addEventListener("click", () => showToast("Help Centre coming soon!"));
    document.getElementById("profile-customerservice-btn").addEventListener("click", () => showToast("Customer Service coming soon!"));
    const adminBtn = document.getElementById("profile-admin-btn");
    if (adminBtn) adminBtn.addEventListener("click", () => navigate("#/admin"));
    document.getElementById("profile-logout-btn").addEventListener("click", () => {
      showConfirmModal({
        icon: "logout",
        title: "Log out?",
        body: "You'll need to sign in again to access your account, messages, and listings.",
        confirmLabel: "Log out",
        confirmClass: "btn--coral",
        onConfirm: () => {
          DB.session.userId = null;
          saveDB();
          showToast("Logged out.");
          navigate("#/home");
        },
      });
    });

    injectIcons(document.getElementById("screen-profile"));
  }

  // ---------------------------------------------------------
  // Screen: Public user profile (view another seller/buyer)
  // ---------------------------------------------------------
  function ratingStarsMarkup(avg) {
    const rounded = Math.round((avg || 0) * 2) / 2; // nearest half star
    let html = "";
    for (let i = 1; i <= 5; i++) {
      if (rounded >= i) html += `<span class="rating-star rating-star--full">${ICONS.star}</span>`;
      else if (rounded >= i - 0.5) html += `<span class="rating-star rating-star--half">${ICONS.star}</span>`;
      else html += `<span class="rating-star rating-star--empty">${ICONS.star}</span>`;
    }
    return html;
  }

  function renderUserProfile(userId) {
    const page = document.getElementById("user-profile-page");
    const profileUser = getUser(userId);

    if (!profileUser) {
      page.innerHTML = `
        <div class="empty-state" style="padding-top:80px">
          <p class="empty-state__title">User not found</p>
          <p class="empty-state__sub">This profile may have been removed.</p>
        </div>`;
      return;
    }

    // If viewing your own profile via this route, send them to the full profile screen instead.
    if (isAuthenticated() && currentUser().id === profileUser.id) {
      navigate("#/profile");
      return;
    }

    const ratings = (DB.sellerRatings || []).filter((r) => r.sellerId === profileUser.id).sort((a, b) => b.createdAt - a.createdAt);
    const avgRating = profileUser.averageRating || (ratings.length ? ratings.reduce((s, r) => s + r.stars, 0) / ratings.length : null);
    const ratingCount = profileUser.ratingCount || ratings.length;

    const soldCount = DB.reservations.filter((r) => {
      const listing = getListing(r.listingId);
      return listing?.sellerId === profileUser.id && (r.status === "completed" || r.trackingStatus === "Completed");
    }).reduce((sum, r) => sum + Math.max(1, r.quantity || 1), 0);

    const userListings = DB.listings
      .filter((l) => l.sellerId === profileUser.id && isListingAvailable(l))
      .sort((a, b) => b.createdAt - a.createdAt)
      .map((l) => ({ ...l, seller: profileUser }));

    page.innerHTML = `
      <div class="page-header page-header--narrow">
        <button class="link-btn" id="user-profile-back-btn">← Back</button>
      </div>
      <div class="user-profile-card">
        <div class="avatar avatar--lg">${initials(profileUser.name)}</div>
        <h1 class="font-fraunces user-profile-card__name">${escapeHtml(profileUser.name)}</h1>
        <div class="location-badge">${ICONS.mapPin} ${escapeHtml(profileUser.barangay || "Barangay")}</div>

        <div class="user-profile-rating">
          ${avgRating
            ? `<span class="user-profile-rating__stars">${ratingStarsMarkup(avgRating)}</span>
               <span class="user-profile-rating__num">${avgRating.toFixed(1)}</span>
               <span class="user-profile-rating__count">(${ratingCount} rating${ratingCount === 1 ? "" : "s"})</span>`
            : `<span class="user-profile-rating__none">No ratings yet</span>`}
        </div>

        <div class="profile-me-stats user-profile-card__stats">
          <div class="profile-me-stat"><span class="profile-me-stat__val">${soldCount}</span><span class="profile-me-stat__label">Sold</span></div>
          <div class="profile-me-stat"><span class="profile-me-stat__val">${userListings.length}</span><span class="profile-me-stat__label">Active listings</span></div>
          <div class="profile-me-stat"><span class="profile-me-stat__val">${ratingCount}</span><span class="profile-me-stat__label">Reviews</span></div>
        </div>

        ${isAuthenticated() ? `<button class="btn btn--forest btn--block" id="user-profile-message-btn">${ICONS.messageCircle} Message</button>` : ""}
      </div>

      <div class="dashboard-card">
        <h2 class="section-heading">Listings from ${escapeHtml(profileUser.name)}</h2>
        <div class="listing-grid" id="user-profile-listings-grid"></div>
      </div>

      <div class="dashboard-card">
        <h2 class="section-heading">Reviews</h2>
        <div id="user-profile-reviews-list"></div>
      </div>
    `;

    renderListingCardsInto(
      document.getElementById("user-profile-listings-grid"),
      userListings,
      `${profileUser.name} has no active listings right now.`
    );

    const reviewsList = document.getElementById("user-profile-reviews-list");
    if (ratings.length === 0) {
      reviewsList.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">No reviews yet</p>
          <p class="empty-state__sub">Reviews from buyers will show up here once they rate this seller.</p>
        </div>`;
    } else {
      reviewsList.innerHTML = ratings.map((r) => {
        const reviewer = getUser(r.buyerId);
        return `
          <div class="review-card">
            <div class="review-card__top">
              <div class="avatar" style="width:34px;height:34px;font-size:12px">${initials(reviewer?.name)}</div>
              <div class="review-card__top-info">
                <p class="review-card__name">${escapeHtml(reviewer?.name || "Anonymous buyer")}</p>
                <span class="review-card__stars">${ratingStarsMarkup(r.stars)}</span>
              </div>
              <span class="review-card__time">${timeAgo(r.createdAt)} ago</span>
            </div>
            ${r.comment ? `<p class="review-card__comment">${escapeHtml(r.comment)}</p>` : ""}
          </div>`;
      }).join("");
    }

    document.getElementById("user-profile-back-btn").addEventListener("click", () => history.back());
    const msgBtn = document.getElementById("user-profile-message-btn");
    if (msgBtn) {
      msgBtn.addEventListener("click", () => {
        const convo = findOrCreateConversation(currentUser().id, profileUser.id, userListings[0]?.id || null);
        navigate(`#/chat/${convo.id}`);
      });
    }
  }

  // ---------------------------------------------------------
  // Screen: Transaction History  (Purchases · Sales · Trades)
  // ---------------------------------------------------------
  let ordersActiveTab = "purchases"; // "purchases" | "sales" | "trades"
  let purchaseSubTab = "all"; // "all" | "topay" | "toship" | "toreceive" | "completed"

  function renderOrders(qs, fromNav = false) {
    const page = document.getElementById("orders-page");
    if (!isAuthenticated()) {
      page.innerHTML = `
        <div class="empty-state" style="padding-top:80px">
          <p class="empty-state__title">Please log in</p>
          <p class="empty-state__sub">Sign in to view your transaction history.</p>
        </div>`;
      return;
    }

    const user = currentUser();
    const orders = listOrdersForUser(user.id);
    const myPurchases = orders.filter((o) => o.buyerId === user.id);
    const mySales    = orders.filter((o) => o.listing?.sellerId === user.id && o.buyerId !== user.id);
    const allTrades  = getTradeRequestsForUser(user.id);
    const highlightId = parseInt(qs.get("reservationId") || "0", 10);

    // Only re-derive the active tab / sub-tab from the URL on a genuine
    // navigation (e.g. arriving via the profile quick-nav links or a
    // notification deep-link). Internal re-renders — triggered by clicking
    // a tab/sub-tab, confirming an order, rating a seller, etc. — reuse the
    // same `qs` object and must NOT re-apply it, or the user's own clicks
    // on "To Pay" / "To Ship" / "To Receive" / "Completed" get immediately
    // overwritten back to whatever sub-tab the page was originally opened to.
    if (fromNav) {
      const subParam = qs.get("sub") || "";
      if (highlightId) ordersActiveTab = "purchases";
      if (subParam) {
        ordersActiveTab = "purchases";
        purchaseSubTab = subParam;
      }
    }

    // ── status helpers ────────────────────────────────────────
    function orderStatusPill(order, isSellerView) {
      const isPending   = order.status === "awaiting_confirmation";
      const isDeclined  = order.status === "declined";
      const isCompleted = order.trackingStatus === "Completed";
      const canBuyerConfirm = order.buyerId === user.id && !isCompleted && ["Delivered", "Awaiting Confirmation"].includes(order.trackingStatus);
      if (isPending && isSellerView) return `<span class="order-status-pill order-status-pill--pending">Needs confirmation</span>`;
      if (isPending)   return `<span class="order-status-pill order-status-pill--pending">Awaiting seller</span>`;
      if (isDeclined)  return `<span class="order-status-pill order-status-pill--declined">Declined</span>`;
      if (isCompleted) return `<span class="order-status-pill order-status-pill--completed">Completed</span>`;
      if (canBuyerConfirm) return `<span class="order-status-pill order-status-pill--pending">Awaiting your confirmation</span>`;
      return `<span class="order-status-pill" style="background:var(--sand);color:var(--muted);border:1px solid var(--tan-border-2)">In progress</span>`;
    }

    function tradePill(status) {
      const map = { pending: "trade-pill--pending", accepted: "trade-pill--accepted", rejected: "trade-pill--rejected", cancelled: "trade-pill--cancelled" };
      const label = { pending: "Pending", accepted: "Accepted", rejected: "Declined", cancelled: "Cancelled" };
      return `<span class="trade-pill ${map[status] || ""}">${label[status] || status}</span>`;
    }

    // ── purchase sub-tab filtering ────────────────────────────
    function getPurchaseSubTab(order) {
      if (order.status === "declined") return "declined";
      if (order.trackingStatus === "Completed" || order.status === "completed") return "completed";
      if (["Awaiting Confirmation", "Delivered"].includes(order.trackingStatus)) return "toreceive";
      if (["Waiting for Seller Confirmation", "Order Confirmed"].includes(order.trackingStatus) || order.status === "awaiting_confirmation") return "topay";
      return "toship"; // In transit: Preparing Item, Picked Up, Out for Delivery, Waiting for Meet-up
    }

    function filterPurchasesBySubTab(orders, sub) {
      if (sub === "all") return orders;
      return orders.filter((o) => getPurchaseSubTab(o) === sub);
    }

    const subTabCounts = {
      topay: myPurchases.filter((o) => getPurchaseSubTab(o) === "topay").length,
      toship: myPurchases.filter((o) => getPurchaseSubTab(o) === "toship").length,
      toreceive: myPurchases.filter((o) => getPurchaseSubTab(o) === "toreceive").length,
      completed: myPurchases.filter((o) => getPurchaseSubTab(o) === "completed").length,
    };

    const filteredPurchases = filterPurchasesBySubTab(myPurchases, purchaseSubTab);

    const purchasesSubTabsHtml = `
      <div class="purchase-subtabs">
        ${[
          { key: "all", label: "All" },
          { key: "topay", label: "To Pay", count: subTabCounts.topay },
          { key: "toship", label: "To Ship", count: subTabCounts.toship },
          { key: "toreceive", label: "To Receive", count: subTabCounts.toreceive },
          { key: "completed", label: "Completed", count: subTabCounts.completed },
        ].map(({ key, label, count }) => `
          <button class="purchase-subtab ${purchaseSubTab === key ? "purchase-subtab--active" : ""}" data-purchase-sub="${key}">
            ${label}${count ? ` <span class="purchase-subtab__count">${count}</span>` : ""}
          </button>`).join("")}
      </div>`;

    // ── order card (shared for purchases + sales) ─────────────
    function orderCard(order, isSellerView) {
      const { steps, activeIndex } = getReservationProgress(order);
      const isPending   = order.status === "awaiting_confirmation";
      const isDeclined  = order.status === "declined";
      const isCompleted = order.trackingStatus === "Completed";
      const canBuyerConfirm = order.buyerId === user.id && !isCompleted && ["Delivered", "Awaiting Confirmation"].includes(order.trackingStatus);
      const qty = order.quantity || 1;
      const itemTotal = Number(order.itemPrice || 0) * qty;
      const otherParty = isSellerView ? getUser(order.buyerId) : getUser(order.listing?.sellerId);

      const paymentLine = order.paymentMethod
        ? `<p class="hist-card__meta-row">
             <span class="hist-card__label">Payment</span>
             <span>${escapeHtml(String(order.paymentMethod).toUpperCase())}${order.paymentReference ? ` &middot; <span style="font-family:monospace;font-size:12px">${escapeHtml(order.paymentReference)}</span>` : ""}</span>
           </p>`
        : "";

      let actions = "";
      if (isSellerView && isPending) {
        actions = `
          <button class="btn btn--outline btn--sm" data-order-chat="${order.id}">${ICONS.messageCircle} Chat</button>
          <button class="btn btn--outline btn--sm" data-order-decline="${order.id}">Decline</button>
          <button class="btn btn--forest btn--sm" data-order-confirm="${order.id}">${ICONS.check} Confirm order</button>`;
      } else if (isSellerView) {
        actions = `
          <button class="btn btn--outline btn--sm" data-order-chat="${order.id}">${ICONS.messageCircle} Chat</button>
          <button class="btn btn--outline btn--sm" data-order-edit="${order.listing?.id || ""}">${ICONS.edit} Edit item</button>
          ${!isDeclined && !isCompleted ? `<button class="btn btn--forest btn--sm" data-order-advance="${order.id}">Advance status</button>` : ""}`;
      } else {
        actions = `
          <button class="btn btn--outline btn--sm" data-order-chat="${order.id}">${ICONS.messageCircle} Chat</button>
          ${canBuyerConfirm ? `<button class="btn btn--forest btn--sm" data-order-received="${order.id}">${ICONS.check} Mark received</button>` : ""}`;
      }

      return `
        <div class="hist-card ${highlightId === order.id ? "hist-card--highlight" : ""} ${isPending && isSellerView ? "hist-card--needs-action" : ""}">
          <!-- header row -->
          <div class="hist-card__header">
            <div class="hist-card__header-left">
              <span class="hist-card__ref">${escapeHtml(order.referenceNumber)}</span>
              <span class="hist-card__date">${timeAgo(order.createdAt)} ago</span>
            </div>
            ${orderStatusPill(order, isSellerView)}
          </div>

          <!-- item row -->
          <div class="hist-card__item-row">
            ${listingImageMarkup(order.listing, "hist-card__img")}
            <div class="hist-card__item-info">
              <p class="hist-card__item-title">${escapeHtml(order.listing?.title || "Item")}</p>
              <p class="hist-card__item-sub">${escapeHtml(order.listing?.category || "")}</p>
              <p class="hist-card__qty-price">
                <span class="hist-card__qty">x${qty}</span>
                <span class="hist-card__price">\u20b1${itemTotal ? itemTotal.toLocaleString() : escapeHtml(String(order.amountPaid || ""))}</span>
              </p>
            </div>
          </div>

          <!-- meta table -->
          <div class="hist-card__meta">
            <p class="hist-card__meta-row">
              <span class="hist-card__label">${isSellerView ? "Buyer" : "Seller"}</span>
              <span>${escapeHtml(otherParty?.name || "—")}</span>
            </p>
            <p class="hist-card__meta-row">
              <span class="hist-card__label">Method</span>
              <span>${order.receivingMethod === "delivery" ? `\uD83D\uDE9A Delivery${order.courier ? " &middot; " + escapeHtml(order.courier) : ""}` : "\uD83E\uDD1D Meet-up"}</span>
            </p>
            ${paymentLine}
            ${isSellerView && order.paymentScreenshot ? `<div class="hist-card__screenshot"><img src="${escapeHtml(order.paymentScreenshot)}" alt="Payment screenshot" /></div>` : ""}
            ${isDeclined && order.declineReason ? `<p class="hist-card__meta-row"><span class="hist-card__label">Decline reason</span><span>${escapeHtml(order.declineReason)}</span></p>` : ""}
          </div>

          <!-- tracking timeline -->
          ${!isDeclined ? `
          <div class="hist-card__tracking">
            <p class="hist-card__label" style="margin-bottom:10px">Order progress</p>
            <div class="hist-track">
              ${steps.map((step, idx) => `
                <div class="hist-track__step ${idx <= activeIndex ? "hist-track__step--done" : ""} ${idx === activeIndex ? "hist-track__step--active" : ""}">
                  <div class="hist-track__dot"></div>
                  <span class="hist-track__label">${escapeHtml(step)}</span>
                </div>`).join("")}
            </div>
          </div>` : ""}

          <!-- hints -->
          ${isPending && !isSellerView ? `<p class="hist-card__hint">Waiting for seller to confirm. You'll be notified once it's approved.</p>` : ""}
          ${canBuyerConfirm ? `<p class="hist-card__hint">Item has arrived? Tap <strong>Mark received</strong> to complete the transaction.</p>` : ""}
          ${isPending && isSellerView ? `<p class="hist-card__hint">Review the buyer's payment and confirm or decline this order.</p>` : ""}

          <!-- actions -->
          ${actions ? `<div class="hist-card__actions">${actions}</div>` : ""}
        </div>`;
    }

    // ── trade card ────────────────────────────────────────────
    function tradeCard(req) {
      const isRequester = req.requesterId === user.id;
      const otherUser   = isRequester ? getUser(req.targetListing?.sellerId) : req.requester;
      const myItem      = isRequester ? req.offeredListing : req.targetListing;
      const theirItem   = isRequester ? req.targetListing  : req.offeredListing;
      const isIncoming  = !isRequester;
      const myOfferText = isRequester ? req.offeredText : null;

      let actions = "";
      if (isIncoming && req.status === "pending") {
        actions = `
          <button class="btn btn--forest btn--sm" data-trade-accept="${req.id}">Accept</button>
          <button class="btn btn--outline btn--sm" data-trade-reject="${req.id}">Decline</button>
          <button class="btn btn--outline btn--sm" data-trade-chat="${req.id}">${ICONS.messageCircle} Chat</button>`;
      } else if (isRequester && req.status === "pending") {
        actions = `
          <button class="btn btn--outline btn--sm" data-trade-cancel="${req.id}">Cancel offer</button>
          <button class="btn btn--outline btn--sm" data-trade-chat="${req.id}">${ICONS.messageCircle} Chat</button>`;
      } else if (req.status === "accepted") {
        actions = `<button class="btn btn--outline btn--sm" data-trade-chat="${req.id}">${ICONS.messageCircle} Open chat to coordinate</button>`;
      }

      return `
        <div class="hist-card ${isIncoming && req.status === "pending" ? "hist-card--needs-action" : ""}">
          <!-- header -->
          <div class="hist-card__header">
            <div class="hist-card__header-left">
              <span class="hist-card__ref">${isIncoming ? "Incoming offer" : "Your offer"}</span>
              <span class="hist-card__date">${timeAgo(req.createdAt)} ago</span>
            </div>
            ${tradePill(req.status)}
          </div>

          <!-- trade exchange visual -->
          <div class="hist-trade-exchange">
            <!-- their side -->
            <div class="hist-trade-side">
              <p class="hist-trade-side__label">${isIncoming ? "They want" : "You want"}</p>
              ${theirItem
                ? `${listingImageMarkup(theirItem, "hist-card__img")}
                   <p class="hist-trade-side__title">${escapeHtml(theirItem.title)}</p>
                   <p class="hist-trade-side__price">\u20b1${escapeHtml(String(theirItem.price))}</p>`
                : `<div class="hist-trade-side__unknown">?</div><p class="hist-trade-side__title" style="color:var(--muted);font-style:italic">Item unavailable</p>`}
            </div>

            <div class="hist-trade-arrow">\u21c4</div>

            <!-- my side -->
            <div class="hist-trade-side">
              <p class="hist-trade-side__label">${isIncoming ? "They offer" : "You offer"}</p>
              ${myItem
                ? `${listingImageMarkup(myItem, "hist-card__img")}
                   <p class="hist-trade-side__title">${escapeHtml(myItem.title)}</p>
                   <p class="hist-trade-side__price">\u20b1${escapeHtml(String(myItem.price))}</p>`
                : myOfferText
                  ? `<div class="hist-trade-side__text-offer">${escapeHtml(myOfferText)}</div>`
                  : `<div class="hist-trade-side__unknown">?</div>`}
            </div>
          </div>

          <!-- meta -->
          <div class="hist-card__meta">
            <p class="hist-card__meta-row">
              <span class="hist-card__label">${isIncoming ? "From" : "To"}</span>
              <span>${escapeHtml(otherUser?.name || "Unknown user")}</span>
            </p>
            ${req.message ? `<p class="hist-card__meta-row"><span class="hist-card__label">Message</span><span>\u201c${escapeHtml(req.message)}\u201d</span></p>` : ""}
          </div>

          ${actions ? `<div class="hist-card__actions">${actions}</div>` : ""}
        </div>`;
    }

    // ── filter bar helpers ────────────────────────────────────
    function tabCount(n) {
      return n > 0 ? `<span class="hist-tab__count">${n}</span>` : "";
    }

    const activeOrPendingPurchases = myPurchases.filter((o) => !["declined"].includes(o.status) && o.trackingStatus !== "Completed");
    const activeOrPendingSales     = mySales.filter((o) => !["declined"].includes(o.status) && o.trackingStatus !== "Completed");
    const pendingTrades            = allTrades.filter((r) => r.status === "pending");

    // ── render shell ──────────────────────────────────────────
    page.innerHTML = `
      <div class="page-header">
        <h1 class="font-fraunces">Transaction History</h1>
        <p>All your purchases, sales, and trade requests in one place.</p>
      </div>

      <!-- summary strip -->
      <div class="hist-summary-strip">
        <div class="hist-summary-item">
          <p class="hist-summary-item__value">${myPurchases.length}</p>
          <p class="hist-summary-item__label">Total orders</p>
        </div>
        <div class="hist-summary-item">
          <p class="hist-summary-item__value">${mySales.length}</p>
          <p class="hist-summary-item__label">Total sales</p>
        </div>
        <div class="hist-summary-item">
          <p class="hist-summary-item__value">${allTrades.length}</p>
          <p class="hist-summary-item__label">Trade requests</p>
        </div>
        <div class="hist-summary-item">
          <p class="hist-summary-item__value">${myPurchases.filter((o) => o.trackingStatus === "Completed").length + mySales.filter((o) => o.trackingStatus === "Completed").length}</p>
          <p class="hist-summary-item__label">Completed</p>
        </div>
      </div>

      <!-- tabs -->
      <div class="hist-tabs">
        <button class="hist-tab ${ordersActiveTab === "purchases" ? "hist-tab--active" : ""}" data-hist-tab="purchases">
          ${ICONS.shoppingCart} Purchases ${tabCount(activeOrPendingPurchases.length)}
        </button>
        <button class="hist-tab ${ordersActiveTab === "sales" ? "hist-tab--active" : ""}" data-hist-tab="sales">
          ${ICONS.package} Sales ${tabCount(activeOrPendingSales.length)}
        </button>
        <button class="hist-tab ${ordersActiveTab === "trades" ? "hist-tab--active" : ""}" data-hist-tab="trades">
          ⇄ Trades ${tabCount(pendingTrades.length)}
        </button>
      </div>

      <!-- tab panels -->
      <div id="hist-panel-purchases" class="hist-panel ${ordersActiveTab === "purchases" ? "" : "hist-panel--hidden"}">
        ${purchasesSubTabsHtml}
        <div class="orders-list">
          ${filteredPurchases.length
            ? filteredPurchases.map((o) => {
                const isCompleted = o.trackingStatus === "Completed" || o.status === "completed";
                const sellerRated = o.sellerRated === true;
                const rateBtn = isCompleted && !sellerRated
                  ? `<button class="btn btn--outline btn--sm" data-order-rate-seller="${o.id}" style="margin-top:8px">${ICONS.star} Rate Seller</button>`
                  : isCompleted && sellerRated
                    ? `<p class="hist-card__hint" style="color:var(--forest)">✓ You've rated this seller</p>`
                    : "";
                return orderCard(o, false) + (rateBtn ? `<div style="padding:0 16px 14px">${rateBtn}</div>` : "");
              }).join("")
            : `<div class="empty-state"><p class="empty-state__title">No orders here</p><p class="empty-state__sub">Items you order will show up here.</p></div>`}
        </div>
      </div>

      <div id="hist-panel-sales" class="hist-panel ${ordersActiveTab === "sales" ? "" : "hist-panel--hidden"}">
        <div class="orders-list">
          ${mySales.length
            ? mySales.map((o) => orderCard(o, true)).join("")
            : `<div class="empty-state"><p class="empty-state__title">No sales yet</p><p class="empty-state__sub">Orders placed on your listings will appear here.</p></div>`}
        </div>
      </div>

      <div id="hist-panel-trades" class="hist-panel ${ordersActiveTab === "trades" ? "" : "hist-panel--hidden"}">
        <div class="orders-list">
          ${allTrades.length
            ? allTrades.map((r) => tradeCard(r)).join("")
            : `<div class="empty-state"><p class="empty-state__title">No trade requests yet</p><p class="empty-state__sub">Your sent and received trade offers appear here.</p></div>`}
        </div>
      </div>
    `;

    injectIcons(page);

    injectIcons(page);

    // ── purchase sub-tab switching ────────────────────────────
    page.querySelectorAll("[data-purchase-sub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        purchaseSubTab = btn.getAttribute("data-purchase-sub");
        renderOrders(qs);
      });
    });

    // ── rate seller ──────────────────────────────────────────
    page.querySelectorAll("[data-order-rate-seller]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const orderId = parseInt(btn.getAttribute("data-order-rate-seller"), 10);
        const order = getReservation(orderId);
        if (!order) return;
        const listing = getListing(order.listingId);
        const seller = listing ? getUser(listing.sellerId) : null;
        showRateSellerModal(order, seller, () => renderOrders(qs));
      });
    });

    // ── tab switching ─────────────────────────────────────────
    page.querySelectorAll("[data-hist-tab]").forEach((btn) => {
      btn.addEventListener("click", () => {
        ordersActiveTab = btn.getAttribute("data-hist-tab");
        renderOrders(qs);
      });
    });

    // ── order actions ─────────────────────────────────────────
    page.querySelectorAll("[data-order-chat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const order = getReservation(parseInt(btn.getAttribute("data-order-chat"), 10));
        if (!order) return;
        const listing = getListing(order.listingId);
        const convo = listing ? findOrCreateConversation(order.buyerId, listing.sellerId, listing.id) : null;
        if (convo) navigate(`#/chat/${convo.id}`);
      });
    });
    page.querySelectorAll("[data-order-edit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const listingId = parseInt(btn.getAttribute("data-order-edit"), 10);
        if (listingId) navigate(`#/post?edit=${listingId}`);
      });
    });
    page.querySelectorAll("[data-order-advance]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const updated = advanceReservationTracking(parseInt(btn.getAttribute("data-order-advance"), 10));
        if (updated) { showToast(`Status updated: ${updated.trackingStatus}`); renderOrders(qs); }
      });
    });
    page.querySelectorAll("[data-order-confirm]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reservationId = parseInt(btn.getAttribute("data-order-confirm"), 10);
        const order = getReservation(reservationId);
        if (!order) return;
        showConfirmModal({
          icon: "warning",
          title: "Confirm this order?",
          body: `Buyer's payment will be verified and the item locked as ${order.paymentType === "full" ? "sold" : "reserved"}.`,
          confirmLabel: "Yes, confirm",
          confirmClass: "btn--forest",
          onConfirm: () => {
            const updated = confirmReservation(reservationId);
            if (updated) { showToast("Order confirmed!"); renderOrders(qs); }
          },
        });
      });
    });
    page.querySelectorAll("[data-order-received]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const updated = confirmReservationReceived(parseInt(btn.getAttribute("data-order-received"), 10));
        if (updated) { showToast("Marked as received. Transaction complete!"); renderOrders(qs); }
      });
    });
    page.querySelectorAll("[data-order-decline]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reservationId = parseInt(btn.getAttribute("data-order-decline"), 10);
        const order = getReservation(reservationId);
        if (!order) return;
        showConfirmModal({
          icon: "danger",
          title: "Decline this order?",
          body: "The item will go back to available. You can enter a reason for the buyer.",
          confirmLabel: "Yes, decline",
          confirmClass: "btn--coral",
          onConfirm: () => {
            const reason = prompt("Optional: reason for declining (e.g. payment not verified, item sold elsewhere).") || "";
            const updated = declineReservation(reservationId, reason.trim());
            if (updated) { showToast("Order declined. Listing is available again."); renderOrders(qs); }
          },
        });
      });
    });

    // ── trade actions ─────────────────────────────────────────
    page.querySelectorAll("[data-trade-accept]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reqId = parseInt(btn.getAttribute("data-trade-accept"), 10);
        showConfirmModal({
          icon: "warning",
          title: "Accept this trade offer?",
          body: "The requester will be notified and a chat thread will open to coordinate the exchange.",
          confirmLabel: "Yes, accept",
          confirmClass: "btn--forest",
          onConfirm: () => { updateTradeRequest(reqId, "accepted", user.id); showToast("Trade accepted! Open chat to coordinate."); renderOrders(qs); },
        });
      });
    });
    page.querySelectorAll("[data-trade-reject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reqId = parseInt(btn.getAttribute("data-trade-reject"), 10);
        showConfirmModal({
          icon: "danger",
          title: "Decline this trade?",
          body: "The requester will be notified that their offer was not accepted.",
          confirmLabel: "Yes, decline",
          confirmClass: "btn--coral",
          onConfirm: () => { updateTradeRequest(reqId, "rejected", user.id); showToast("Trade declined."); renderOrders(qs); },
        });
      });
    });
    page.querySelectorAll("[data-trade-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reqId = parseInt(btn.getAttribute("data-trade-cancel"), 10);
        showConfirmModal({
          icon: "warning",
          title: "Cancel your trade offer?",
          body: "Your offer will be withdrawn.",
          confirmLabel: "Yes, cancel",
          confirmClass: "btn--coral",
          onConfirm: () => { updateTradeRequest(reqId, "cancelled", user.id); showToast("Trade offer cancelled."); renderOrders(qs); },
        });
      });
    });
    page.querySelectorAll("[data-trade-chat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reqId = parseInt(btn.getAttribute("data-trade-chat"), 10);
        const req = DB.tradeRequests.find((r) => r.id === reqId);
        if (!req) return;
        const targetListing = getListing(req.targetListingId);
        if (!targetListing) return;
        const convo = findOrCreateConversation(req.requesterId, targetListing.sellerId, req.targetListingId);
        navigate(`#/chat/${convo.id}`);
      });
    });

    // Auto-scroll to highlighted card
    if (highlightId) {
      setTimeout(() => {
        const el = document.querySelector(".hist-card--highlight");
        if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 80);
    }
  }



  // ---------------------------------------------------------
  // Screen: Report item
  // ---------------------------------------------------------
  const REPORT_ATTACHMENT_STATE = { dataUrl: "", fileName: "" };
  let reportTargetListingId = null;

  function renderReport(listingId) {
    const page = document.getElementById("report-page");
    const listing = getListing(listingId);
    reportTargetListingId = listingId;
    REPORT_ATTACHMENT_STATE.dataUrl = "";
    REPORT_ATTACHMENT_STATE.fileName = "";

    if (!listing) {
      page.innerHTML = `<div class="empty-state"><p class="empty-state__title">Listing not found</p></div>`;
      return;
    }

    if (!isAuthenticated()) {
      page.innerHTML = `
        <div class="report-shell">
          <div class="empty-state">
            <p class="empty-state__title">Please log in</p>
            <p class="empty-state__sub">Sign in to submit a report.</p>
          </div>
        </div>`;
      return;
    }

    const reasonOptions = REPORT_REASON_OPTIONS.map((reason) => `<option value="${escapeHtml(reason)}">${escapeHtml(reason)}</option>`).join("");
    page.innerHTML = `
      <div class="page-header page-header--narrow">
        <button class="link-btn" id="report-back-btn">← Back</button>
        <h1 class="font-fraunces">Report post</h1>
        <p>Submit a structured report for review.</p>
      </div>
      <div class="report-shell">
        <div class="report-preview">
          <div class="report-preview__thumb">
            ${listingImageMarkup(listing, "report-preview__img")}
          </div>
          <div class="report-preview__body">
            <p class="report-preview__title">${escapeHtml(listing.title)}</p>
            <p class="report-preview__price">₱${escapeHtml(String(listing.price))}</p>
            <p class="report-preview__meta">${escapeHtml(listing.location)}</p>
            <p class="report-preview__meta">${escapeHtml(listing.category)} · <span class="report-preview__status">${escapeHtml(listing.status || "available")}</span></p>
            ${listing.seller ? `<p class="report-preview__seller">Seller: ${escapeHtml(listing.seller.name || "Unknown")}</p>` : ""}
          </div>
        </div>
        <form class="report-form" id="form-report">
          <div class="field">
            <label>Reason for reporting</label>
            <select id="report-reason">${reasonOptions}</select>
          </div>
          <div class="field">
            <label>Short explanation</label>
            <textarea id="report-explanation" rows="4" placeholder="Briefly describe the issue."></textarea>
          </div>
          <div class="field">
            <label>Additional note (optional)</label>
            <textarea id="report-note" rows="3" placeholder="Add anything else the admin should know."></textarea>
          </div>
          <div class="field">
            <label>Attachment (optional)</label>
            <p class="field-hint">Upload a screenshot or photo as evidence.</p>
            <label class="report-attachment-upload-btn" for="report-attachment">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              Choose photo
            </label>
            <input type="file" id="report-attachment" accept="image/*" style="display:none" />
            <p class="field-error" id="report-attachment-error"></p>
            <div class="report-attachment-preview" id="report-attachment-preview">
              <p class="report-attachment-preview__placeholder">No photo selected</p>
            </div>
          </div>
          <p class="section-hint">Your identity will stay hidden from the seller or trader.</p>
          <button class="btn btn--coral btn--lg" type="submit">Submit report</button>
        </form>
      </div>`;

    document.getElementById("report-back-btn").addEventListener("click", () => navigate(`#/item/${listingId}`));
    const attachmentInput = document.getElementById("report-attachment");
    const attachmentPreview = document.getElementById("report-attachment-preview");
    attachmentInput.addEventListener("change", () => {
      const file = attachmentInput.files && attachmentInput.files[0];
      if (!file) {
        REPORT_ATTACHMENT_STATE.dataUrl = "";
        REPORT_ATTACHMENT_STATE.fileName = "";
        attachmentPreview.innerHTML = "";
        return;
      }
      if (!file.type || !file.type.startsWith("image/")) {
        document.getElementById("report-attachment-error").textContent = "Please upload an image file.";
        attachmentInput.value = "";
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        REPORT_ATTACHMENT_STATE.dataUrl = String(reader.result || "");
        REPORT_ATTACHMENT_STATE.fileName = file.name;
        attachmentPreview.innerHTML = `<img src="${escapeHtml(REPORT_ATTACHMENT_STATE.dataUrl)}" alt="Report attachment preview" />`;
      };
      reader.readAsDataURL(file);
    });
    document.getElementById("form-report").addEventListener("submit", (e) => {
      e.preventDefault();
      const reason = document.getElementById("report-reason").value;
      const explanation = document.getElementById("report-explanation").value.trim();
      const note = document.getElementById("report-note").value.trim();
      const report = createReport({
        listingId,
        reporterId: currentUser().id,
        reason,
        explanation,
        note,
        attachment: REPORT_ATTACHMENT_STATE.dataUrl,
      });
      page.innerHTML = `
        <div class="report-shell">
          <div class="confirm-card" style="max-width:720px;margin:0 auto">
            <div class="confirm-icon confirm-icon--success">${ICONS.check}</div>
            <h2 class="confirm-heading">Your report has been submitted for review.</h2>
            <p class="confirm-sub">The listing is now marked as reported and sent to the admin queue.</p>
            <div class="report-result-grid">
              <div class="report-result-row"><span>Reason</span><strong>${escapeHtml(report.reason)}</strong></div>
              <div class="report-result-row"><span>Status</span><strong>Reported</strong></div>
              <div class="report-result-row"><span>Privacy</span><strong>Identity hidden</strong></div>
            </div>
            <button class="btn btn--coral" id="report-done-btn">Back to item</button>
          </div>
        </div>`;
      document.getElementById("report-done-btn").addEventListener("click", () => navigate(`#/item/${listingId}`));
    });
  }

  // ---------------------------------------------------------
  // Screen: Admin dashboard
  // ---------------------------------------------------------
  let adminSelectedReportId = null;
  let adminSelectedListingId = null;

    function renderAdmin() {
    const page = document.getElementById("admin-page");
    const user = currentUser();
    if (!user || user.role !== "admin") {
      page.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">Admin access only</p>
          <p class="empty-state__sub">This dashboard is private.</p>
        </div>`;
      return;
    }

    if (!window.adminDashboardState) {
      window.adminDashboardState = { search: "", status: "all" };
    }
    const state = window.adminDashboardState;
    const query = (state.search || "").trim().toLowerCase();
    const statusFilter = state.status || "all";
    const matches = (...parts) => !query || parts.filter(Boolean).join(" ").toLowerCase().includes(query);
    const listStatus = (listing) => String(listing.status || "available").toLowerCase();

    const allReports = (DB.reports || []).slice().sort((a, b) => b.createdAt - a.createdAt);
    const flaggedListings = DB.listings
      .map((listing) => getListing(listing.id))
      .filter((listing) => listing && (listing.flagged || listing.reviewStatus === "flagged" || listing.reviewStatus === "reported"));
    const warningUsers = DB.users.filter((u) => (u.warningCount || 0) > 0 || (u.warningHistory || []).length > 0);
    const deliveryIssues = DB.reservations.map((reservation) => normalizeReservation(reservation)).filter((reservation) => reservation.receivingMethod === "delivery" && reservation.trackingStatus !== "Completed" && reservation.status !== "declined");
    const completedTransactions = DB.reservations.filter((reservation) => reservation.trackingStatus === "Completed" || reservation.status === "completed").length;
    const pendingReviews = allReports.filter((report) => report.status === "pending").length;
    const activeWarnings = warningUsers.reduce((sum, u) => sum + (u.warningCount || 0), 0);

    const summaryCards = [
      { label: "Total users", value: DB.users.length },
      { label: "Total listings", value: DB.listings.length },
      { label: "Reported posts", value: allReports.length },
      { label: "Flagged posts", value: flaggedListings.length },
      { label: "Pending reviews", value: pendingReviews },
      { label: "Active warnings", value: activeWarnings },
      { label: "Completed transactions", value: completedTransactions },
    ];

    const filteredReports = allReports.filter((report) => {
      const listing = getListing(report.listingId);
      const reportStatus = String(report.status || "pending").toLowerCase();
      const reportMatch = matches(listing?.title, report.reason, report.explanation, report.note, listing?.seller?.name, report.matchedKeyword);
      const statusMatch = statusFilter === "all" || reportStatus === statusFilter || (statusFilter === "flagged" && (listing?.flagged || report.autoFlagged));
      return reportMatch && statusMatch;
    });

    const filteredFlagged = flaggedListings.filter((listing) => {
      const status = String(listing.status || "available").toLowerCase();
      return matches(listing.title, listing.description, listing.matchedKeyword, listing.hiddenReason, listing.seller?.name) &&
        (statusFilter === "all" || statusFilter === "flagged" || status === statusFilter || (statusFilter === "reported" && listing.reviewStatus === "reported"));
    });

    const filteredWarnings = warningUsers.filter((u) => {
      return matches(u.name, u.email, u.warningHistory?.[0]?.note, String(u.warningCount || 0)) &&
        (statusFilter === "all" || statusFilter === "warning" || statusFilter === "restricted" || statusFilter === "suspended");
    });

    const filteredDelivery = deliveryIssues.filter((reservation) => {
      const listing = getListing(reservation.listingId);
      const ageHours = (Date.now() - reservation.createdAt) / 36e5;
      return matches(listing?.title, reservation.referenceNumber, reservation.trackingStatus, reservation.courier, reservation.buyerId) &&
        (statusFilter === "all" || statusFilter === "delivery" || ageHours >= 24 || reservation.trackingStatus === "Delivered");
    });

    if (!adminSelectedReportId && filteredReports.length) adminSelectedReportId = filteredReports[0].id;
    if (!adminSelectedListingId && filteredFlagged.length) adminSelectedListingId = filteredFlagged[0].id;

    const selectedReport = filteredReports.find((r) => r.id === adminSelectedReportId) || filteredReports[0] || null;
    const selectedListing = filteredFlagged.find((l) => l.id === adminSelectedListingId) || getListing(selectedReport?.listingId || 0) || filteredFlagged[0] || null;
    const selectedListingReports = selectedListing ? getReportsForListing(selectedListing.id) : [];
    const auditLog = (DB.auditLog || []).slice().sort((a, b) => b.createdAt - a.createdAt).slice(0, 18);

    const badge = (value) => `<span class="admin-status-chip admin-status-chip--${String(value || "pending").toLowerCase()}">${escapeHtml(String(value || "pending").replace(/_/g, " "))}</span>`;

    page.innerHTML = `
      <div class="page-header">
        <h1 class="font-fraunces">Admin dashboard</h1>
        <p>Private moderation workspace for flagged listings, reported posts, warnings, and delivery issues.</p>
      </div>

      <div class="dashboard-card admin-guide">
        <div class="admin-guide__icon">${ICONS.shieldCheck}</div>
        <div class="admin-guide__body">
          <h2 class="section-heading" style="margin-bottom:8px">Presentation guide</h2>
          <p class="admin-guide__text">Use this page to explain the demo flow: keyword detection auto-flags risky posts, reports go straight into review, sellers can stop at Delivered / Awaiting Confirmation, and buyers finish the order with Received.</p>
        </div>
      </div>

      <div class="admin-toolbar">
        <div class="searchbar admin-toolbar__search">
          <span class="searchbar__icon">${ICONS.search}</span>
          <input id="admin-search" type="text" value="${escapeHtml(state.search)}" placeholder="Search reports, users, listings…" />
        </div>
        <select id="admin-status-filter" class="admin-select">
          <option value="all" ${statusFilter === "all" ? "selected" : ""}>All statuses</option>
          <option value="flagged" ${statusFilter === "flagged" ? "selected" : ""}>Flagged</option>
          <option value="reported" ${statusFilter === "reported" ? "selected" : ""}>Reported</option>
          <option value="pending" ${statusFilter === "pending" ? "selected" : ""}>Pending</option>
          <option value="warning" ${statusFilter === "warning" ? "selected" : ""}>Warnings</option>
          <option value="restricted" ${statusFilter === "restricted" ? "selected" : ""}>Restricted</option>
          <option value="suspended" ${statusFilter === "suspended" ? "selected" : ""}>Suspended</option>
          <option value="delivery" ${statusFilter === "delivery" ? "selected" : ""}>Delivery issues</option>
          <option value="hidden" ${statusFilter === "hidden" ? "selected" : ""}>Hidden</option>
          <option value="deleted" ${statusFilter === "deleted" ? "selected" : ""}>Deleted</option>
          <option value="resolved" ${statusFilter === "resolved" ? "selected" : ""}>Resolved</option>
        </select>
      </div>

      <div class="admin-summary-grid">
        ${summaryCards.map((card) => `<div class="admin-summary-card"><p class="admin-summary-card__value">${card.value}</p><p class="admin-summary-card__label">${card.label}</p></div>`).join("")}
      </div>

      <div class="admin-layout">
        <div class="dashboard-card admin-panel">
          <div class="section-heading-row">
            <h2 class="section-heading">Reported posts</h2>
            ${badge("reported")}
          </div>
          <div class="admin-list" id="admin-reports-list">
            ${filteredReports.length ? filteredReports.map((report) => {
              const listing = getListing(report.listingId);
              return `
                <button class="admin-list-item ${adminSelectedReportId === report.id ? "active" : ""}" data-admin-report="${report.id}">
                  <div class="admin-list-item__content">
                    <p class="admin-list-item__title">${escapeHtml(listing?.title || "Listing removed")}</p>
                    <p class="admin-list-item__meta">${escapeHtml(report.reason)} · ${timeAgo(report.createdAt)}</p>
                    <p class="admin-list-item__meta">Status: ${escapeHtml(report.status || "pending")} · Keyword: ${escapeHtml(report.matchedKeyword || listing?.matchedKeyword || "—")}</p>
                  </div>
                  ${badge(report.status || "pending")}
                </button>`;
            }).join("") : `<div class="empty-state"><p class="empty-state__title">No reports yet</p></div>`}
          </div>
        </div>

        <div class="dashboard-card admin-panel">
          <div class="section-heading-row">
            <h2 class="section-heading">Review details</h2>
            ${selectedReport ? badge(selectedReport.status || "pending") : badge("resolved")}
          </div>
          ${selectedListing ? `
            <div class="admin-detail-card">
              ${listingImageMarkup(selectedListing, "admin-detail-card__img")}
              <div class="admin-detail-card__body">
              <p class="admin-detail-card__title">${escapeHtml(selectedListing.title)}</p>
              <p class="admin-detail-card__meta">${escapeHtml(selectedListing.description)}</p>
              <p class="admin-detail-card__meta">Seller: ${escapeHtml(selectedListing.seller?.name || "Unknown")}</p>
              <p class="admin-detail-card__meta">Matched keyword: ${escapeHtml(selectedListing.matchedKeyword || selectedReport?.matchedKeyword || "—")}</p>
              <p class="admin-detail-card__meta">Reports: ${getListingReportedCount(selectedListing.id)}</p>
              <p class="admin-detail-card__meta">Current status: ${escapeHtml(selectedListing.status || "available")}</p>
              <div class="admin-action-row">
                <button class="btn btn--forest btn--sm" data-admin-approve="${selectedListing.id}">${ICONS.check} Approve</button>
                <button class="btn btn--outline btn--sm" data-admin-hide="${selectedListing.id}">${ICONS.eyeOff} Hide</button>
                <button class="btn btn--outline btn--sm" data-admin-reveal="${selectedListing.id}">${ICONS.eye} Reappear</button>
                <button class="btn btn--outline btn--sm" data-admin-delete="${selectedListing.id}">${ICONS.trash} Delete</button>
              </div>
              <div class="admin-action-row">
                <button class="btn btn--outline btn--sm" data-admin-warn="${selectedListing.sellerId}">${ICONS.flag} Warn user</button>
                <button class="btn btn--coral btn--sm" data-admin-suspend="${selectedListing.sellerId}">${ICONS.ban} Suspend</button>
                <button class="btn btn--outline btn--sm" data-admin-resolve="${selectedReport ? selectedReport.id : ""}">${ICONS.check} Resolve report</button>
              </div>
              <div class="admin-note-list">
                ${selectedListingReports.map((report) => `<div class="admin-note"><strong>${escapeHtml(report.reason)}</strong><br>${escapeHtml(report.explanation || report.note || "No extra details.")}</div>`).join("") || `<div class="empty-state"><p class="empty-state__sub">No report notes yet.</p></div>`}
              </div>
              </div>
            </div>` : `<div class="empty-state"><p class="empty-state__title">Select a report or flagged listing</p><p class="empty-state__sub">Review details appear here.</p></div>`}
        </div>
      </div>

      <div class="admin-layout" style="margin-top:18px">
        <div class="dashboard-card admin-panel">
          <div class="section-heading-row">
            <h2 class="section-heading">Flagged listings</h2>
            ${badge("flagged")}
          </div>
          <div class="admin-list" id="admin-flagged-list">
            ${filteredFlagged.length ? filteredFlagged.map((listing) => `
              <button class="admin-list-item ${adminSelectedListingId === listing.id ? "active" : ""}" data-admin-listing="${listing.id}">
                <div class="admin-list-item__content">
                  <p class="admin-list-item__title">${escapeHtml(listing.title)}</p>
                  <p class="admin-list-item__meta">${escapeHtml(listing.hiddenReason || listing.flagNotes?.[0] || "Flagged for review")}</p>
                  <p class="admin-list-item__meta">Matched keyword: ${escapeHtml(listing.matchedKeyword || "—")} · Seller: ${escapeHtml(listing.seller?.name || "Unknown")}</p>
                </div>
                ${badge(listStatus(listing))}
              </button>`).join("") : `<div class="empty-state"><p class="empty-state__title">No flagged listings</p></div>`}
          </div>
        </div>

        <div class="dashboard-card admin-panel">
          <div class="section-heading-row">
            <h2 class="section-heading">User warnings</h2>
            ${badge("warning")}
          </div>
          <div class="admin-list" id="admin-warning-list">
            ${filteredWarnings.length ? filteredWarnings.map((u) => `
              <div class="admin-list-item admin-list-item--static">
                <div class="admin-list-item__content">
                  <p class="admin-list-item__title">${escapeHtml(u.name)}</p>
                  <p class="admin-list-item__meta">${escapeHtml(u.email || "No email")} · ${u.warningCount || 0} warning${(u.warningCount || 0) === 1 ? "" : "s"}</p>
                  <p class="admin-list-item__meta">${escapeHtml(u.warningHistory?.[0]?.note || "No warning note yet.")}</p>
                </div>
                <div class="admin-list-item__actions">
                  <button class="btn btn--outline btn--sm" data-admin-user-warn="${u.id}">${ICONS.flag} Warn</button>
                  <button class="btn btn--coral btn--sm" data-admin-user-suspend="${u.id}">${ICONS.ban} Suspend</button>
                </div>
              </div>`).join("") : `<div class="empty-state"><p class="empty-state__title">No warnings yet</p></div>`}
          </div>
        </div>
      </div>

      <div class="admin-layout" style="margin-top:18px">
        <div class="dashboard-card admin-panel">
          <div class="section-heading-row">
            <h2 class="section-heading">Delivery issues</h2>
            ${badge("delivery")}
          </div>
          <div class="admin-list" id="admin-delivery-list">
            ${filteredDelivery.length ? filteredDelivery.map((reservation) => {
              const listing = getListing(reservation.listingId);
              const buyer = getUser(reservation.buyerId);
              const ageHours = Math.round((Date.now() - reservation.createdAt) / 36e5);
              const issueType = reservation.trackingStatus === "Delivered" ? "Awaiting buyer confirmation" : ageHours >= 48 ? "Delayed" : "In progress";
              return `
                <div class="admin-list-item admin-list-item--static">
                  <div class="admin-list-item__content">
                    <p class="admin-list-item__title">${escapeHtml(listing?.title || "Listing")}</p>
                    <p class="admin-list-item__meta">${escapeHtml(reservation.referenceNumber)} · ${escapeHtml(reservation.trackingStatus || "")}</p>
                    <p class="admin-list-item__meta">Buyer: ${escapeHtml(buyer?.name || "Unknown")} · ${issueType}</p>
                  </div>
                  <div class="admin-list-item__actions">
                    <button class="btn btn--outline btn--sm" data-admin-delivery-chat="${reservation.id}">Open chat</button>
                  </div>
                </div>`;
            }).join("") : `<div class="empty-state"><p class="empty-state__title">No delivery issues</p></div>`}
          </div>
        </div>

        <div class="dashboard-card admin-panel">
          <div class="section-heading-row">
            <h2 class="section-heading">System activity</h2>
            ${badge("audit")}
          </div>
          <div class="audit-log-list">
            ${auditLog.length ? auditLog.map((entry) => `
              <div class="admin-note">
                <strong>${escapeHtml(entry.action.replace(/_/g, " "))}</strong><br>
                <span>${escapeHtml(timeAgo(entry.createdAt))}</span>
              </div>`).join("") : `<div class="empty-state"><p class="empty-state__title">No activity yet</p></div>`}
          </div>
        </div>
      </div>
    `;

    const searchInput = document.getElementById("admin-search");
    const statusSelect = document.getElementById("admin-status-filter");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.search = e.target.value;
        renderAdmin();
      });
    }
    if (statusSelect) {
      statusSelect.addEventListener("change", (e) => {
        state.status = e.target.value;
        renderAdmin();
      });
    }

    page.querySelectorAll("[data-admin-report]").forEach((btn) => {
      btn.addEventListener("click", () => {
        adminSelectedReportId = parseInt(btn.getAttribute("data-admin-report"), 10);
        const report = DB.reports.find((r) => r.id === adminSelectedReportId);
        if (report) adminSelectedListingId = report.listingId;
        renderAdmin();
      });
    });
    page.querySelectorAll("[data-admin-listing]").forEach((btn) => {
      btn.addEventListener("click", () => {
        adminSelectedListingId = parseInt(btn.getAttribute("data-admin-listing"), 10);
        renderAdmin();
      });
    });

    page.querySelectorAll("[data-admin-approve]").forEach((btn) => {
      btn.addEventListener("click", () => {
        approveListing(parseInt(btn.getAttribute("data-admin-approve"), 10));
        showToast("Listing approved.");
        renderAdmin();
      });
    });
    page.querySelectorAll("[data-admin-hide]").forEach((btn) => {
      btn.addEventListener("click", () => {
        hideListing(parseInt(btn.getAttribute("data-admin-hide"), 10));
        showToast("Listing hidden.");
        renderAdmin();
      });
    });
    page.querySelectorAll("[data-admin-reveal]").forEach((btn) => {
      btn.addEventListener("click", () => {
        revealListing(parseInt(btn.getAttribute("data-admin-reveal"), 10));
        showToast("Listing reappeared.");
        renderAdmin();
      });
    });
    page.querySelectorAll("[data-admin-delete]").forEach((btn) => {
      btn.addEventListener("click", () => {
        deleteListingCompletely(parseInt(btn.getAttribute("data-admin-delete"), 10));
        showToast("Listing deleted.");
        renderAdmin();
      });
    });
    page.querySelectorAll("[data-admin-warn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        warnUser(parseInt(btn.getAttribute("data-admin-warn"), 10), "Admin warning from report review.");
        showToast("User warned.");
        renderAdmin();
      });
    });
    page.querySelectorAll("[data-admin-suspend]").forEach((btn) => {
      btn.addEventListener("click", () => {
        suspendUser(parseInt(btn.getAttribute("data-admin-suspend"), 10));
        showToast("User suspended.");
        renderAdmin();
      });
    });
    page.querySelectorAll("[data-admin-resolve]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const rid = parseInt(btn.getAttribute("data-admin-resolve"), 10);
        if (rid) markReportResolved(rid);
        showToast("Report resolved.");
        renderAdmin();
      });
    });
    page.querySelectorAll("[data-admin-user-warn]").forEach((btn) => {
      btn.addEventListener("click", () => {
        warnUser(parseInt(btn.getAttribute("data-admin-user-warn"), 10), "Manual admin warning.");
        showToast("User warned.");
        renderAdmin();
      });
    });
    page.querySelectorAll("[data-admin-user-suspend]").forEach((btn) => {
      btn.addEventListener("click", () => {
        suspendUser(parseInt(btn.getAttribute("data-admin-user-suspend"), 10));
        showToast("User suspended.");
        renderAdmin();
      });
    });
    page.querySelectorAll("[data-admin-delivery-chat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reservation = getReservation(parseInt(btn.getAttribute("data-admin-delivery-chat"), 10));
        const listing = reservation ? getListing(reservation.listingId) : null;
        const convo = reservation && listing ? findOrCreateConversation(reservation.buyerId, listing.sellerId, listing.id) : null;
        if (convo) navigate(`#/chat/${convo.id}`);
      });
    });
  }


  // ---------------------------------------------------------
  // Screen: Saved items
  // ---------------------------------------------------------
  function renderSaved() {
    const list = document.getElementById("saved-list");
    if (!isAuthenticated()) {
      list.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">Please log in</p>
          <p class="empty-state__sub">Sign in to view your saved items.</p>
        </div>`;
      return;
    }
    const items = listSavedItems(currentUser().id);
    const listings = items.map((item) => item.listing);
    renderListingCardsInto(list, listings, "Tap the bookmark icon on any item to save it here.");
  }

  // ---------------------------------------------------------
  // Screen: Messages (Inbox)
  // ---------------------------------------------------------
  function renderInbox() {
    const list = document.getElementById("inbox-list");
    if (!isAuthenticated()) {
      list.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">Please log in</p>
          <p class="empty-state__sub">Sign in to view your messages.</p>
        </div>`;
      return;
    }
    const convos = listConversationsForUser(currentUser().id);
    if (convos.length === 0) {
      list.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">No messages yet</p>
          <p class="empty-state__sub">Message a seller from an item page to start a conversation.</p>
        </div>`;
      return;
    }
    list.innerHTML = "";
    convos.forEach((c) => {
      const card = document.createElement("div");
      card.className = "convo-card convo-card--message";
      const preview = c.lastMessage ? escapeHtml(c.lastMessage.content) : "Say hello!";
      const time = c.lastMessage ? timeAgo(c.lastMessage.createdAt) : timeAgo(c.createdAt);
      card.innerHTML = `
        <button class="convo-card__main" type="button">
          <div class="avatar">${initials(c.otherUser?.name)}</div>
          <div class="convo-card__body">
            <div class="convo-card__top">
              <p class="convo-card__name">${escapeHtml(c.otherUser?.name || "Unknown")}</p>
              <span class="convo-card__time">${time}</span>
            </div>
            <p class="convo-card__item">${escapeHtml(c.listing?.title || "")}</p>
            <p class="convo-card__preview">${preview}</p>
          </div>
        </button>
        <button class="convo-delete-btn" title="Delete conversation" aria-label="Delete conversation">${ICONS.trash}</button>
      `;
      card.querySelector(".convo-card__main").addEventListener("click", () => navigate(`#/chat/${c.id}`));

      card.querySelector(".convo-delete-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        showConfirmModal({
          icon: "danger",
          title: "Delete this conversation?",
          body: "All messages in this chat will be permanently deleted. This can't be undone.",
          confirmLabel: "Delete conversation",
          confirmClass: "btn--coral",
          onConfirm: () => {
            card.classList.add("convo-card--removing");
            setTimeout(() => {
              deleteConversation(c.id);
              renderInbox();
            }, 180);
          },
        });
      });

      list.appendChild(card);
    });
  }

  // ---------------------------------------------------------
  // Screen: Notifications
  // ---------------------------------------------------------
  function renderNotifications() {
    const page = document.getElementById("notifications-page");
    if (!isAuthenticated()) {
      page.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">Please log in</p>
          <p class="empty-state__sub">Sign in to view your notifications.</p>
        </div>`;
      return;
    }

    const user = currentUser();
    const items = (DB.notifications || []).filter((n) => n.userId === user.id).sort((a, b) => b.createdAt - a.createdAt);
    markNotificationsRead(items.map((n) => n.id));
    page.innerHTML = `
      <div class="page-header">
        <h1 class="font-fraunces">Notifications</h1>
        <p>Important alerts, warnings, and transaction updates.</p>
      </div>
      <div class="notification-shell">
        <div class="notification-list">
          ${items.length ? items.map((n) => `
            <a class="notification-card ${n.readAt ? "read" : "unread"}" href="${n.link || "#"}">
              <div class="notification-card__icon"><span data-icon="${n.type === "warning" ? "alertTriangle" : n.type === "moderation" ? "flag" : "bell"}"></span></div>
              <div class="notification-card__body">
                <div class="convo-card__top">
                  <p class="convo-card__name">${escapeHtml(n.title)}</p>
                  <span class="convo-card__time">${timeAgo(n.createdAt)}</span>
                </div>
                <p class="convo-card__preview">${escapeHtml(n.body)}</p>
              </div>
            </a>`).join("") : `<div class="empty-state"><p class="empty-state__title">No notifications yet</p><p class="empty-state__sub">Important updates will appear here.</p></div>`}
        </div>
      </div>`;
    injectIcons(page);
    renderSiteHeader();
  }

  // ---------------------------------------------------------
  // Screen: Chat
  // ---------------------------------------------------------
  function renderChat(conversationId) {
    const header = document.getElementById("chat-header");
    const messagesEl = document.getElementById("chat-messages");
    const input = document.getElementById("chat-input");
    const sendBtn = document.getElementById("chat-send-btn");

    const user = currentUser();
    const convo = DB.conversations.find((c) => c.id === conversationId);

    if (!user || !convo) {
      header.innerHTML = "";
      messagesEl.innerHTML = `
        <div class="chat-empty">
          <span style="font-size:30px">${ICONS.messageCircle}</span>
          <p style="font-weight:600;color:#2A2724">Conversation not found</p>
        </div>`;
      input.disabled = true;
      sendBtn.disabled = true;
      return;
    }

    input.disabled = false;
    markConversationRead(conversationId);
    renderSiteHeader(); // refresh badge count immediately
    const otherId = convo.buyerId === user.id ? convo.sellerId : convo.buyerId;
    const otherUser = getUser(otherId);

    header.innerHTML = `
      <button class="chat-header__user" id="chat-header-user-btn" type="button">
        <div class="avatar" style="width:34px;height:34px;font-size:12px">${initials(otherUser?.name)}</div>
        <div style="flex:1;min-width:0">
          <p class="chat-header__name">${escapeHtml(otherUser?.name || "Unknown")}</p>
          <p class="chat-header__meta">${escapeHtml(otherUser?.barangay || "")}</p>
        </div>
      </button>
      <button class="chat-report-btn" id="chat-report-user-btn" title="Report this user">${ICONS.flag} Report</button>
    `;

    const headerUserBtn = document.getElementById("chat-header-user-btn");
    if (headerUserBtn && otherUser) {
      headerUserBtn.addEventListener("click", () => navigate(`#/user/${otherUser.id}`));
    }

    function draw() {
      const messages = getMessages(conversationId);
      if (messages.length === 0) {
        messagesEl.innerHTML = `
          <div class="chat-empty">
            <span style="font-size:30px">${ICONS.messageCircle}</span>
            <p style="font-weight:600;color:#2A2724">Start the conversation</p>
            <p style="font-size:12px;color:#6B645C">Send a message to get started.</p>
          </div>`;
        return;
      }
      messagesEl.innerHTML = messages.map((m) => {
        const side = m.senderId === user.id ? "mine" : "theirs";
        // Rich card for trade request messages
        if (m.content.startsWith("[Trade Request]") || m.content.startsWith("[Trade Accepted]")) {
          const isAccepted = m.content.startsWith("[Trade Accepted]");
          const msgText = m.content.replace(/^\[Trade (Request|Accepted)\]\s*/, "");
          const targetListing = convo.listingId ? getListing(convo.listingId) : null;
          const imgSrc = targetListing ? escapeHtml(getListingImageSrc(targetListing)) : "";
          const tradeReq = DB.tradeRequests ? DB.tradeRequests.find(r =>
            (r.requesterId === m.senderId || r.requesterId === (m.senderId === user.id ? otherId : user.id)) &&
            r.targetListingId === convo.listingId
          ) : null;
          const offeredListing = tradeReq?.offeredListingId ? getListing(tradeReq.offeredListingId) : null;
          const offeredImgSrc = offeredListing ? escapeHtml(getListingImageSrc(offeredListing)) :
            (tradeReq?.offeredPhoto ? escapeHtml(tradeReq.offeredPhoto) : "");

          return `
            <div class="bubble-row ${side}">
              <div class="trade-bubble ${side}">
                <div class="trade-bubble__header">
                  ${isAccepted
                    ? `<span class="trade-bubble__badge trade-bubble__badge--accepted">✓ Trade Accepted</span>`
                    : `<span class="trade-bubble__badge">⇄ Trade Request</span>`}
                </div>
                ${targetListing ? `
                  <div class="trade-bubble__items">
                    ${offeredImgSrc ? `
                      <div class="trade-bubble__item">
                        <img src="${offeredImgSrc}" alt="Offered item" class="trade-bubble__img" />
                        <div class="trade-bubble__item-info">
                          <span class="trade-bubble__tag">Offering</span>
                          <span class="trade-bubble__name">${escapeHtml(offeredListing?.title || tradeReq?.offeredText || "Item")}</span>
                          ${offeredListing ? `<span class="trade-bubble__price">₱${escapeHtml(String(offeredListing.price))}</span>` : ""}
                        </div>
                      </div>
                      <div class="trade-bubble__arrow">⇄</div>` : ""}
                    <div class="trade-bubble__item">
                      <img src="${imgSrc}" alt="${escapeHtml(targetListing.title)}" class="trade-bubble__img" />
                      <div class="trade-bubble__item-info">
                        <span class="trade-bubble__tag">${offeredImgSrc ? "For" : "Wants to trade for"}</span>
                        <span class="trade-bubble__name">${escapeHtml(targetListing.title)}</span>
                        <span class="trade-bubble__price">₱${escapeHtml(String(targetListing.price))}</span>
                      </div>
                    </div>
                  </div>` : ""}
                ${msgText ? `<p class="trade-bubble__msg">"${escapeHtml(msgText)}"</p>` : ""}
              </div>
            </div>`;
        }
        return `
          <div class="bubble-row ${side}">
            <div class="bubble ${side}">${escapeHtml(m.content)}</div>
          </div>`;
      }).join("");
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    function handleSend() {
      const text = input.value.trim();
      if (!text) return;
      sendMessage(conversationId, user.id, text);
      input.value = "";
      markConversationRead(conversationId); // I just sent it, so it's "read" on my end
      draw();
      renderSiteHeader();

      // Lightweight demo touch: the other party (a seeded local user) sends
      // a short auto-reply after a short delay, so the inbox/badges feel alive.
      if (otherUser && otherUser.loginMethod === "seed") {
        setTimeout(() => {
          const replies = [
            "Sure, still available! When would you like to meet up?",
            "Yes po, available pa. Saan po kayo malapit?",
            "Hi! Thanks for the message — give me a moment to check.",
            "Okay noted! I'll hold this for you.",
          ];
          const reply = replies[Math.floor(Math.random() * replies.length)];
          sendMessage(conversationId, otherUser.id, reply);
          // Only re-draw live if the user is still on this exact conversation.
          if (route.name === "chat" && route.params.conversationId === conversationId) {
            markConversationRead(conversationId);
            draw();
          }
          renderSiteHeader();
        }, 1400);
      }
    }

    sendBtn.onclick = handleSend;
    input.onkeydown = (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSend();
      }
    };
    sendBtn.disabled = false;

    // Report user from chat
    const chatReportBtn = document.getElementById("chat-report-user-btn");
    if (chatReportBtn) {
      chatReportBtn.addEventListener("click", () => {
        showChatReportModal(otherUser, convo);
      });
    }

    draw();
  }

  // ---------------------------------------------------------
  // Screen: Settings
  // ---------------------------------------------------------
  function renderSettings() {
    const page = document.getElementById("settings-page");
    const user = currentUser();

    if (!user) {
      page.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">Please log in</p>
          <p class="empty-state__sub">Sign in to access your settings.</p>
        </div>`;
      return;
    }

    // Ensure preferences object exists
    if (!user.prefs) {
      user.prefs = {
        notifOrders: true,
        notifMessages: true,
        notifPromos: false,
        showPhone: false,
        showEmail: false,
        darkMode: false,
      };
    }

    function toggle(key) {
      user.prefs[key] = !user.prefs[key];
      saveDB();
      renderSettings();
    }

    function switchHtml(key) {
      const on = !!user.prefs[key];
      return `
        <label class="switch" style="cursor:pointer;pointer-events:none">
          <input type="checkbox" ${on ? "checked" : ""} style="position:absolute;opacity:0;pointer-events:none" />
          <span class="switch__track" style="${on ? "background:var(--forest)" : ""}"><span class="switch__thumb" style="${on ? "transform:translateX(20px)" : ""}"></span></span>
        </label>`;
    }

    const barangayVal = escapeHtml(user.barangay || "—");
    const nameVal = escapeHtml(user.name || "");
    const emailVal = escapeHtml(user.email || "—");

    page.innerHTML = `
      <div class="settings-shell">
        <div class="settings-page-header">
          <button class="settings-back-btn" id="settings-back-btn" aria-label="Back">${ICONS.arrowLeft}</button>
          <h1 class="font-fraunces">Settings</h1>
        </div>

        <!-- Account Info -->
        <p class="settings-section-label" style="padding:0 4px 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)">Account</p>
        <div class="settings-section">
          <div class="settings-input-group" style="border:none;border-radius:0;margin:0">
            <div class="settings-input-row">
              <label>Name</label>
              <input id="settings-name" type="text" value="${nameVal}" placeholder="Your name" />
            </div>
            <div class="settings-input-row">
              <label>Email</label>
              <input type="text" value="${emailVal}" disabled style="opacity:.5;cursor:default" />
            </div>
            <div class="settings-input-row">
              <label>Barangay</label>
              <input id="settings-barangay" type="text" value="${barangayVal !== "—" ? barangayVal : ""}" placeholder="Your barangay" />
            </div>
          </div>
          <div style="padding:12px 18px 14px;border-top:1px solid var(--tan-border)">
            <button class="btn btn--forest btn--block" id="settings-save-profile-btn">Save changes</button>
          </div>
        </div>

        <!-- Security -->
        <p class="settings-section-label" style="padding:10px 4px 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)">Security</p>
        <div class="settings-section">
          <button class="settings-item settings-item--purple" id="settings-change-password-btn">
            <span class="settings-item__icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg></span>
            <span class="settings-item__body">
              <span class="settings-item__label">Change password</span>
              <span class="settings-item__sub">Update your login password</span>
            </span>
            <span class="settings-item__right"><span class="chevron-right">›</span></span>
          </button>
          <button class="settings-item settings-item--sky" id="settings-linked-accounts-btn">
            <span class="settings-item__icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg></span>
            <span class="settings-item__body">
              <span class="settings-item__label">Linked accounts</span>
              <span class="settings-item__sub">Google, Facebook, and more</span>
            </span>
            <span class="settings-item__right"><span class="chevron-right">›</span></span>
          </button>
        </div>

        <!-- Notifications -->
        <p class="settings-section-label" style="padding:10px 4px 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)">Notifications</p>
        <div class="settings-section">
          <div class="settings-toggle-item" data-toggle-pref="notifOrders" style="cursor:pointer">
            <span class="settings-item__icon settings-item--forest" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:rgba(31,77,61,0.10);color:var(--forest)">${ICONS.package}</span>
            <span class="settings-item__body" style="flex:1;pointer-events:none">
              <span class="settings-item__label">Order updates</span>
              <span class="settings-item__sub">Reservations, confirmations, deliveries</span>
            </span>
            ${switchHtml("notifOrders")}
          </div>
          <div class="settings-toggle-item" data-toggle-pref="notifMessages" style="cursor:pointer">
            <span class="settings-item__icon settings-item--coral" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:rgba(255,107,74,0.10);color:var(--coral-dark)">${ICONS.messageCircle}</span>
            <span class="settings-item__body" style="flex:1;pointer-events:none">
              <span class="settings-item__label">Messages</span>
              <span class="settings-item__sub">New chats and replies</span>
            </span>
            ${switchHtml("notifMessages")}
          </div>
          <div class="settings-toggle-item" data-toggle-pref="notifPromos" style="cursor:pointer">
            <span class="settings-item__icon settings-item--amber" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#FEF6E7;color:#92660B">${ICONS.bell}</span>
            <span class="settings-item__body" style="flex:1;pointer-events:none">
              <span class="settings-item__label">Promos & announcements</span>
              <span class="settings-item__sub">New features and community updates</span>
            </span>
            ${switchHtml("notifPromos")}
          </div>
        </div>

        <!-- Privacy -->
        <p class="settings-section-label" style="padding:10px 4px 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)">Privacy</p>
        <div class="settings-section">
          <div class="settings-toggle-item" data-toggle-pref="showPhone" style="cursor:pointer">
            <span class="settings-item__icon settings-item--gray" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--sand);color:var(--muted)">${ICONS.user}</span>
            <span class="settings-item__body" style="flex:1;pointer-events:none">
              <span class="settings-item__label">Show phone to buyers</span>
              <span class="settings-item__sub">Your number appears on your listings</span>
            </span>
            ${switchHtml("showPhone")}
          </div>
          <div class="settings-toggle-item" data-toggle-pref="showEmail" style="cursor:pointer">
            <span class="settings-item__icon settings-item--gray" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:var(--sand);color:var(--muted)">${ICONS.send}</span>
            <span class="settings-item__body" style="flex:1;pointer-events:none">
              <span class="settings-item__label">Show email to buyers</span>
              <span class="settings-item__sub">Your email appears on your listings</span>
            </span>
            ${switchHtml("showEmail")}
          </div>
        </div>

        <!-- About -->
        <p class="settings-section-label" style="padding:10px 4px 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)">About</p>
        <div class="settings-section">
          <button class="settings-item settings-item--forest" id="settings-help-btn">
            <span class="settings-item__icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg></span>
            <span class="settings-item__body">
              <span class="settings-item__label">Help & support</span>
              <span class="settings-item__sub">FAQs, contact us, community rules</span>
            </span>
            <span class="settings-item__right"><span class="chevron-right">›</span></span>
          </button>
          <button class="settings-item" id="settings-feedback-btn" style="border-top:1px solid var(--tan-border)">
            <span class="settings-item__icon" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#E8F3EF;color:var(--forest)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
            <span class="settings-item__body">
              <span class="settings-item__label">Send feedback</span>
              <span class="settings-item__sub">Share ideas or suggestions with us</span>
            </span>
            <span class="settings-item__right"><span class="chevron-right">›</span></span>
          </button>
          <button class="settings-item" id="settings-report-problem-btn" style="border-top:1px solid var(--tan-border)">
            <span class="settings-item__icon" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;flex-shrink:0;background:#FEF2F2;color:var(--danger)"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.7 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg></span>
            <span class="settings-item__body">
              <span class="settings-item__label">Report a problem</span>
              <span class="settings-item__sub">Something broken? Let us know</span>
            </span>
            <span class="settings-item__right"><span class="chevron-right">›</span></span>
          </button>
          <button class="settings-item settings-item--gray" id="settings-terms-btn" style="border-top:1px solid var(--tan-border)">
            <span class="settings-item__icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg></span>
            <span class="settings-item__body">
              <span class="settings-item__label">Terms & privacy policy</span>
              <span class="settings-item__sub">Read our user agreements</span>
            </span>
            <span class="settings-item__right"><span class="chevron-right">›</span></span>
          </button>
          <div class="settings-item settings-item--gray" style="cursor:default">
            <span class="settings-item__icon"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"/><circle cx="12" cy="10" r="3"/></svg></span>
            <span class="settings-item__body">
              <span class="settings-item__label">App version</span>
              <span class="settings-item__sub">BentaLink v1.0.0</span>
            </span>
            <span class="settings-item__right" style="font-size:12px;color:var(--muted)">Latest</span>
          </div>
        </div>

        <!-- Danger zone -->
        <p class="settings-section-label" style="padding:10px 4px 6px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--muted)">Account Actions</p>
        <div class="settings-section">
          <button class="settings-item" id="settings-logout-btn">
            <span class="settings-item__icon" style="width:36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:#FEF6E7;color:#92660B">${ICONS.logOut}</span>
            <span class="settings-item__body">
              <span class="settings-item__label" style="color:#92660B">Log out</span>
              <span class="settings-item__sub">Sign out of your account</span>
            </span>
          </button>
          <button class="settings-item settings-item--danger" id="settings-delete-account-btn">
            <span class="settings-item__icon">${ICONS.trash}</span>
            <span class="settings-item__body">
              <span class="settings-item__label">Delete account</span>
              <span class="settings-item__sub">Permanently remove your account and listings</span>
            </span>
          </button>
        </div>

        <div style="height:32px"></div>
      </div>`;

    // Back button
    document.getElementById("settings-back-btn").addEventListener("click", () => navigate("#/profile"));

    // Save profile
    document.getElementById("settings-save-profile-btn").addEventListener("click", () => {
      const btn = document.getElementById("settings-save-profile-btn");
      const newName = document.getElementById("settings-name").value.trim();
      const newBarangay = document.getElementById("settings-barangay").value.trim();
      if (!newName) { showToast("Name cannot be empty."); return; }
      setButtonLoading(btn, true);
      setTimeout(() => {
        user.name = newName;
        user.barangay = newBarangay;
        saveDB();
        showToast("Profile updated!");
        renderSettings();
      }, 400);
    });

    // Toggle prefs
    page.querySelectorAll("[data-toggle-pref]").forEach((el) => {
      el.addEventListener("click", () => toggle(el.getAttribute("data-toggle-pref")));
    });

    // Change password modal
    document.getElementById("settings-change-password-btn").addEventListener("click", () => {
      showInfoModal({
        icon: "lock",
        title: "Change Password",
        body: `
          <div style="text-align:left;margin-top:4px">
            <div class="modal-field-group">
              <label class="modal-field-label">Current password</label>
              <div class="modal-pw-row">
                <input type="password" id="modal-current-pw" class="modal-field-input" placeholder="Enter current password" autocomplete="current-password" />
                <button type="button" class="modal-pw-eye" data-toggle-modal-pw="modal-current-pw" aria-label="Show/hide">${ICONS.eye}</button>
              </div>
              <p class="modal-field-error" id="modal-current-pw-error"></p>
            </div>
            <div class="modal-field-group">
              <label class="modal-field-label">New password</label>
              <div class="modal-pw-row">
                <input type="password" id="modal-new-pw" class="modal-field-input" placeholder="At least 6 characters" autocomplete="new-password" />
                <button type="button" class="modal-pw-eye" data-toggle-modal-pw="modal-new-pw" aria-label="Show/hide">${ICONS.eye}</button>
              </div>
              <p class="modal-field-error" id="modal-new-pw-error"></p>
            </div>
            <div class="modal-field-group">
              <label class="modal-field-label">Confirm new password</label>
              <div class="modal-pw-row">
                <input type="password" id="modal-confirm-pw" class="modal-field-input" placeholder="Re-enter new password" autocomplete="new-password" />
                <button type="button" class="modal-pw-eye" data-toggle-modal-pw="modal-confirm-pw" aria-label="Show/hide">${ICONS.eye}</button>
              </div>
              <p class="modal-field-error" id="modal-confirm-pw-error"></p>
            </div>
          </div>`,
        confirmLabel: "Update password",
        confirmClass: "btn--forest",
        onConfirm: (closeModal) => {
          const currentPw = document.getElementById("modal-current-pw").value;
          const newPw = document.getElementById("modal-new-pw").value;
          const confirmPw = document.getElementById("modal-confirm-pw").value;
          let ok = true;
          document.getElementById("modal-current-pw-error").textContent = "";
          document.getElementById("modal-new-pw-error").textContent = "";
          document.getElementById("modal-confirm-pw-error").textContent = "";
          if (!currentPw) { document.getElementById("modal-current-pw-error").textContent = "Required"; ok = false; }
          if (!newPw || newPw.length < 6) { document.getElementById("modal-new-pw-error").textContent = "At least 6 characters"; ok = false; }
          if (newPw !== confirmPw) { document.getElementById("modal-confirm-pw-error").textContent = "Passwords don't match"; ok = false; }
          if (!ok) return false; // return false = don't close modal
          // In this localStorage-only demo there's no actual stored password
          // so we just simulate success
          closeModal();
          showToast("Password updated!");
          return true;
        },
      });
      // Wire up toggle-pw buttons inside the modal
      setTimeout(() => {
        document.querySelectorAll("[data-toggle-modal-pw]").forEach((btn) => {
          btn.addEventListener("click", () => {
            const input = document.getElementById(btn.getAttribute("data-toggle-modal-pw"));
            if (!input) return;
            input.type = input.type === "password" ? "text" : "password";
            btn.innerHTML = input.type === "password" ? ICONS.eye : ICONS.eyeOff;
          });
        });
      }, 50);
    });

    // Linked accounts
    document.getElementById("settings-linked-accounts-btn").addEventListener("click", () => {
      showInfoModal({
        icon: "link",
        title: "Linked Accounts",
        body: `<div style="text-align:left;margin-top:8px">
          <div class="linked-account-row">
            <span class="linked-account-icon linked-account-icon--google">G</span>
            <span style="flex:1">
              <span style="font-weight:600;display:block;font-size:14px">Google</span>
              <span style="font-size:12px;color:var(--muted)">Not connected</span>
            </span>
            <button class="btn btn--outline btn--sm" style="opacity:.5;cursor:not-allowed" disabled>Connect</button>
          </div>
          <div class="linked-account-row" style="border-top:1px solid var(--tan-border)">
            <span class="linked-account-icon linked-account-icon--facebook">f</span>
            <span style="flex:1">
              <span style="font-weight:600;display:block;font-size:14px">Facebook</span>
              <span style="font-size:12px;color:var(--muted)">Not connected</span>
            </span>
            <button class="btn btn--outline btn--sm" style="opacity:.5;cursor:not-allowed" disabled>Connect</button>
          </div>
          <p style="font-size:12px;color:var(--muted);margin-top:14px;padding:10px 12px;background:var(--sand);border-radius:10px">Social login linking is coming soon. For now, log in with your email and password.</p>
        </div>`,
        confirmLabel: "Got it",
        confirmClass: "btn--forest",
      });
    });

    // Help & support
    document.getElementById("settings-help-btn").addEventListener("click", () => {
      showInfoModal({
        icon: "help",
        title: "Help & Support",
        body: `<div style="text-align:left;margin-top:4px">
          <div class="help-item"><span class="help-dot"></span><div><strong>How do I post an item?</strong><p>Tap "Post an item" from the top bar, fill in the details, and submit. It'll appear live immediately.</p></div></div>
          <div class="help-item"><span class="help-dot"></span><div><strong>How do reservations work?</strong><p>Buyers can reserve an item with a downpayment or full payment. You'll get notified and can confirm or decline.</p></div></div>
          <div class="help-item"><span class="help-dot"></span><div><strong>Is my data safe?</strong><p>All data is stored locally on your device. We never share your information with third parties.</p></div></div>
          <div class="help-item"><span class="help-dot"></span><div><strong>How do I report a listing?</strong><p>Open the listing and tap the flag icon. Our moderation team reviews all reports within 24 hours.</p></div></div>
          <p style="font-size:12px;color:var(--muted);margin-top:14px;padding:10px 12px;background:var(--sand);border-radius:10px">For other concerns, email us at <strong>support@bentalink.ph</strong></p>
        </div>`,
        confirmLabel: "Close",
        confirmClass: "btn--forest",
      });
    });

    // Feedback
    document.getElementById("settings-feedback-btn").addEventListener("click", () => showFeedbackModal());

    // Report a Problem
    document.getElementById("settings-report-problem-btn").addEventListener("click", () => showReportProblemModal());

    // Terms
    document.getElementById("settings-terms-btn").addEventListener("click", () => {
      showInfoModal({
        icon: "doc",
        title: "Terms & Privacy Policy",
        body: `<div style="text-align:left;max-height:260px;overflow-y:auto;padding-right:4px;margin-top:4px">
          <p style="font-size:13px;font-weight:700;margin:0 0 4px">Terms of Use</p>
          <p style="font-size:12.5px;color:var(--muted);margin:0 0 12px;line-height:1.6">By using BentaLink, you agree to only list items you own and have the right to sell, to be honest in your listings, and to treat other users with respect. Prohibited items include illegal goods, weapons, and counterfeit products.</p>
          <p style="font-size:13px;font-weight:700;margin:0 0 4px">Privacy Policy</p>
          <p style="font-size:12.5px;color:var(--muted);margin:0 0 12px;line-height:1.6">BentaLink stores your data locally on your device. We collect only the information you provide (name, email, barangay) to power the marketplace. We do not sell your data to any third parties.</p>
          <p style="font-size:13px;font-weight:700;margin:0 0 4px">Community Rules</p>
          <p style="font-size:12.5px;color:var(--muted);margin:0;line-height:1.6">No scams, no spam, no harassment. Listings that violate these rules will be hidden and repeat offenders may be suspended. Report any suspicious activity using the flag button on any listing.</p>
        </div>`,
        confirmLabel: "I understand",
        confirmClass: "btn--forest",
      });
    });

    // Logout
    document.getElementById("settings-logout-btn").addEventListener("click", () => {
      const btn = document.getElementById("settings-logout-btn");
      showConfirmModal({
        icon: "logout",
        title: "Log out?",
        body: "You'll need to sign in again to access your account, messages, and listings.",
        confirmLabel: "Log out",
        confirmClass: "btn--coral",
        onConfirm: () => {
          setButtonLoading(btn, true);
          setTimeout(() => {
            DB.session.userId = null;
            saveDB();
            showToast("Logged out.");
            navigate("#/home");
          }, 350);
        },
      });
    });

    // Delete account — two-step: first warning modal, then typed confirmation
    document.getElementById("settings-delete-account-btn").addEventListener("click", () => {
      showConfirmModal({
        icon: "danger",
        title: "Delete your account?",
        body: "This will permanently remove your account, listings, and all messages. This cannot be undone.",
        confirmLabel: "Continue",
        confirmClass: "btn--coral",
        onConfirm: () => {
          showDeleteConfirmModal(() => {
            setButtonLoading(document.getElementById("settings-delete-account-btn"), true);
            const uid = user.id;
            DB.listings = DB.listings.filter((l) => l.sellerId !== uid);
            DB.savedItems = DB.savedItems.filter((s) => s.userId !== uid);
            DB.conversations = DB.conversations.filter((c) => c.buyerId !== uid && c.sellerId !== uid);
            DB.messages = DB.messages.filter((m) => m.senderId !== uid);
            DB.reservations = DB.reservations.filter((r) => r.buyerId !== uid);
            DB.notifications = DB.notifications.filter((n) => n.userId !== uid);
            DB.users = DB.users.filter((u) => u.id !== uid);
            DB.session.userId = null;
            saveDB();
            showToast("Account deleted.");
            navigate("#/home");
          });
        },
      });
    });
  }

  // ---------------------------------------------------------
  // Button loading state helper
  // ---------------------------------------------------------
  function setButtonLoading(btn, loading) {
    if (!btn) return;
    if (loading) {
      btn._origHTML = btn.innerHTML;
      btn._origDisabled = btn.disabled;
      btn.innerHTML = `<span class="btn-spinner"></span>`;
      btn.disabled = true;
    } else {
      if (btn._origHTML !== undefined) btn.innerHTML = btn._origHTML;
      btn.disabled = btn._origDisabled || false;
    }
  }

  // ---------------------------------------------------------
  // Delete-account typed confirmation modal (requires typing "DELETE")
  // ---------------------------------------------------------
  function showDeleteConfirmModal(onConfirm) {
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box" role="dialog" aria-modal="true">
        <div class="modal-icon modal-icon--danger">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.7 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        </div>
        <h3 class="modal-title font-fraunces" style="color:var(--danger)">This cannot be undone</h3>
        <p class="modal-body">Type <strong style="color:var(--ink);font-family:monospace;letter-spacing:.05em">DELETE</strong> to permanently delete your account, all your listings, messages, and history.</p>
        <input id="delete-confirm-input" type="text" placeholder="Type DELETE here" autocomplete="off"
          style="width:100%;border:2px solid var(--tan-border);border-radius:10px;padding:10px 14px;font-size:14.5px;color:var(--ink);outline:none;background:var(--cream);text-align:center;letter-spacing:.08em;font-weight:700;margin-bottom:6px;transition:border-color .15s" />
        <p id="delete-confirm-error" style="font-size:12px;color:var(--danger);min-height:18px;margin:0 0 16px"></p>
        <div class="modal-actions">
          <button class="btn btn--outline" id="delete-cancel-btn">Cancel</button>
          <button class="btn btn--coral" id="delete-final-btn" disabled style="opacity:.4;transition:opacity .15s">Delete permanently</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const input = overlay.querySelector("#delete-confirm-input");
    const confirmBtn = overlay.querySelector("#delete-final-btn");
    const cancelBtn = overlay.querySelector("#delete-cancel-btn");
    const errEl = overlay.querySelector("#delete-confirm-error");

    input.addEventListener("input", () => {
      const match = input.value.trim().toUpperCase() === "DELETE";
      confirmBtn.disabled = !match;
      confirmBtn.style.opacity = match ? "1" : ".4";
      input.style.borderColor = input.value && !match ? "var(--danger)" : match ? "var(--forest)" : "var(--tan-border)";
      errEl.textContent = "";
    });

    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !confirmBtn.disabled) confirmBtn.click();
    });

    function close() {
      overlay.remove();
    }

    confirmBtn.addEventListener("click", () => {
      if (input.value.trim().toUpperCase() !== "DELETE") {
        errEl.textContent = 'Please type DELETE exactly.';
        return;
      }
      close();
      onConfirm && onConfirm();
    });
    cancelBtn.addEventListener("click", close);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });

    setTimeout(() => input.focus(), 80);
  }

  // ---------------------------------------------------------
  // Info / Content Modal (for Help, Terms, Linked Accounts, etc.)
  // ---------------------------------------------------------
  function showInfoModal({ icon = "info", title = "", body = "", confirmLabel = "Close", confirmClass = "btn--forest", onConfirm }) {
    const iconMap = {
      info: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
      help: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><path d="M12 17h.01"/></svg>`,
      doc: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>`,
      link: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>`,
      lock: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    };
    const overlay = document.createElement("div");
    overlay.className = "modal-overlay";
    overlay.innerHTML = `
      <div class="modal-box info-modal-box" role="dialog" aria-modal="true">
        <div class="modal-icon modal-icon--info">${iconMap[icon] || iconMap.info}</div>
        <h3 class="modal-title font-fraunces">${escapeHtml(title)}</h3>
        <div class="modal-body info-modal-body">${body}</div>
        <div class="modal-actions" style="justify-content:center">
          <button class="btn ${confirmClass}" id="info-modal-confirm" style="max-width:200px;width:100%">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const confirmBtn = overlay.querySelector("#info-modal-confirm");
    function close() { overlay.remove(); }
    confirmBtn.addEventListener("click", () => {
      if (onConfirm) {
        const result = onConfirm(close);
        if (result !== false) close();
      } else {
        close();
      }
    });
    overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
  }

  // ---------------------------------------------------------
  // Confirm Modal
  // ---------------------------------------------------------
  function showConfirmModal({ icon = "warning", title = "Are you sure?", body = "", confirmLabel = "Confirm", confirmClass = "btn--coral", onConfirm }) {
    const overlay = document.getElementById("confirm-modal");
    const iconEl = document.getElementById("modal-icon");
    const titleEl = document.getElementById("modal-title");
    const bodyEl = document.getElementById("modal-body");
    const confirmBtn = document.getElementById("modal-confirm-btn");
    const cancelBtn = document.getElementById("modal-cancel-btn");

    const iconMap = {
      danger: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.7 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
      warning: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.7 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
      logout: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" x2="9" y1="12" y2="12"/></svg>`,
      trash: `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M6 6l1 14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-14"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>`,
    };

    iconEl.className = `modal-icon modal-icon--${icon === "logout" ? "warning" : icon === "trash" || icon === "danger" ? "danger" : "warning"}`;
    iconEl.innerHTML = iconMap[icon] || iconMap.warning;
    titleEl.textContent = title;
    bodyEl.textContent = body;
    confirmBtn.textContent = confirmLabel;
    confirmBtn.className = `btn ${confirmClass}`;
    overlay.hidden = false;

    function close() {
      overlay.hidden = true;
      confirmBtn.onclick = null;
      cancelBtn.onclick = null;
      overlay.onclick = null;
    }

    confirmBtn.onclick = () => { close(); onConfirm && onConfirm(); };
    cancelBtn.onclick = close;
    overlay.onclick = (e) => { if (e.target === overlay) close(); };
  }

  // ---------------------------------------------------------
  // Auth forms
  // ---------------------------------------------------------
  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function setFieldError(id, message) {
    const errEl = document.getElementById(id + "-error");
    if (errEl) errEl.textContent = message || "";
  }

  document.getElementById("form-signin").addEventListener("submit", (e) => {
    e.preventDefault();
    const email = document.getElementById("signin-email").value.trim();
    const password = document.getElementById("signin-password").value;
    let ok = true;
    setFieldError("signin-email", "");
    setFieldError("signin-password", "");
    if (!email) { setFieldError("signin-email", "Email is required"); ok = false; }
    else if (!validateEmail(email)) { setFieldError("signin-email", "Invalid email address"); ok = false; }
    if (!password) { setFieldError("signin-password", "Password is required"); ok = false; }
    if (!ok) return;

    const submitBtn = document.querySelector("#form-signin [type=submit]");
    setButtonLoading(submitBtn, true);
    setTimeout(() => {
      const user = DB.users.find((u) => u.email && u.email.toLowerCase() === email.toLowerCase());
      if (!user) {
        setButtonLoading(submitBtn, false);
        setFieldError("signin-email", "No account found with this email. Please sign up first.");
        return;
      }
      // Check password if account has one stored
      if (user.password && user.password !== password) {
        setButtonLoading(submitBtn, false);
        setFieldError("signin-password", "Incorrect password.");
        return;
      }
      DB.session.userId = user.id;
      saveDB();
      showToast(`Welcome back, ${user.name}!`);
      navigate(user.role === "admin" ? "#/admin" : "#/home");
    }, 500);
  });

  document.getElementById("signin-guest").addEventListener("click", () => navigate("#/browse"));

  document.getElementById("form-signup").addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("signup-name").value.trim();
    const email = document.getElementById("signup-email").value.trim();
    const barangay = document.getElementById("signup-barangay").value.trim();
    const password = document.getElementById("signup-password").value;
    const confirm = document.getElementById("signup-confirm").value;

    let ok = true;
    ["signup-name", "signup-email", "signup-barangay", "signup-password", "signup-confirm"].forEach((id) => setFieldError(id, ""));

    if (!name) { setFieldError("signup-name", "Name is required"); ok = false; }
    if (!email) { setFieldError("signup-email", "Email is required"); ok = false; }
    else if (!validateEmail(email)) { setFieldError("signup-email", "Invalid email address"); ok = false; }
    if (!barangay) { setFieldError("signup-barangay", "Barangay is required"); ok = false; }
    if (!password) { setFieldError("signup-password", "Password is required"); ok = false; }
    else if (password.length < 6) { setFieldError("signup-password", "Password must be at least 6 characters"); ok = false; }
    if (!confirm) { setFieldError("signup-confirm", "Please confirm your password"); ok = false; }
    else if (password !== confirm) { setFieldError("signup-confirm", "Passwords do not match"); ok = false; }
    if (!ok) return;

    // Block duplicate emails
    const existing = DB.users.find((u) => u.email && u.email.toLowerCase() === email.toLowerCase());
    if (existing) {
      setFieldError("signup-email", "An account with this email already exists. Please log in instead.");
      return;
    }

    const submitBtn = document.querySelector("#form-signup [type=submit]");
    setButtonLoading(submitBtn, true);
    setTimeout(() => {
      const id = nextId("users");
      const user = {
        id,
        openId: "local-" + id,
        name,
        email,
        password,
        loginMethod: "local",
        barangay,
        role: email.toLowerCase() === "admin@demo.com" ? "admin" : "user",
        createdAt: Date.now(),
      };
      DB.users.push(user);
      DB.session.userId = user.id;
      saveDB();
      showToast(`Account created. Welcome, ${name}!`);
      navigate(user.role === "admin" ? "#/admin" : "#/home");
    }, 500);
  });

  document.querySelectorAll("[data-toggle-pw]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetId = btn.getAttribute("data-toggle-pw");
      const input = document.getElementById(targetId);
      const isPw = input.type === "password";
      input.type = isPw ? "text" : "password";
      btn.innerHTML = ICONS[isPw ? "eyeOff" : "eye"];
    });
  });

  // ---------------------------------------------------------
  // Global nav buttons (data-nav="...")
  // ---------------------------------------------------------
  document.addEventListener("click", (e) => {
    const target = e.target.closest("[data-nav]");
    if (!target) return;
    navigate("#/" + target.getAttribute("data-nav"));
  });

  // ---------------------------------------------------------
  // Utilities
  // ---------------------------------------------------------
  function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function initials(name) {
    if (!name) return "?";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2);
  }

  function timeAgo(ts) {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h`;
    const days = Math.floor(hrs / 24);
    return `${days}d`;
  }

  // ---------------------------------------------------------
  // Report User from Chat Modal
  // ---------------------------------------------------------
  const CHAT_REPORT_REASONS = [
    "Harassment or threatening messages",
    "Spam or repeated unwanted messages",
    "Suspicious or scam behaviour",
    "Offensive or abusive language",
    "Impersonating someone else",
    "Sharing inappropriate content",
    "Other",
  ];

  function showChatReportModal(reportedUser, convo) {
    if (!isAuthenticated()) {
      showToast("Please log in to report a user.");
      return;
    }
    if (!reportedUser) { showToast("User not found."); return; }

    const existing = document.getElementById("chat-report-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "chat-report-modal";
    overlay.className = "sheet-overlay";

    overlay.innerHTML = `
      <div class="sheet-panel" role="dialog" aria-modal="true" aria-labelledby="chat-report-title">
        <div class="sheet-handle"><span></span></div>
        <div class="sheet-header">
          <div class="sheet-header__text">
            <h3 class="modal-title font-fraunces" id="chat-report-title" style="margin:0 0 4px">Report User</h3>
            <p style="font-size:13.5px;color:var(--muted);margin:0">Reporting <strong>${escapeHtml(reportedUser.name || "this user")}</strong>. Select a reason and add any details.</p>
          </div>
          <button class="sheet-header__close" id="chat-report-close" aria-label="Close"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg></button>
        </div>

        <div class="sheet-body">
          <div class="field" style="margin-bottom:12px">
            <label style="font-size:13px;font-weight:600;margin-bottom:8px;display:block">Reason</label>
            <div class="report-reason-list" id="chat-report-reason-list">
              ${CHAT_REPORT_REASONS.map((r) => `
                <label class="report-reason-option">
                  <input type="radio" name="chat-report-reason" value="${escapeHtml(r)}" />
                  <span>${escapeHtml(r)}</span>
                </label>`).join("")}
            </div>
          </div>

          <div class="field" style="margin-bottom:18px">
            <label style="font-size:13px;font-weight:600;margin-bottom:6px;display:block">Additional details <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
            <textarea id="chat-report-details" rows="3" placeholder="Describe what happened…" style="width:100%;padding:10px 12px;border:1.5px solid var(--tan-border);border-radius:10px;font-size:14px;resize:vertical"></textarea>
          </div>

          <p style="font-size:12px;color:var(--muted);background:var(--sand);border-radius:10px;padding:10px 12px;margin-bottom:18px">Reports are reviewed by our moderation team within 24 hours. Repeat violations may result in account suspension.</p>
        </div>

        <div class="sheet-footer">
          <div class="modal-actions">
            <button class="btn btn--outline" id="chat-report-cancel">Cancel</button>
            <button class="btn btn--coral" id="chat-report-submit" disabled>${ICONS.flag} Submit report</button>
          </div>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const submitBtn = overlay.querySelector("#chat-report-submit");
    overlay.querySelectorAll("input[name='chat-report-reason']").forEach((input) => {
      input.addEventListener("change", () => { submitBtn.disabled = false; });
    });

    const closeSheet = () => overlay.remove();
    overlay.querySelector("#chat-report-cancel").addEventListener("click", closeSheet);
    overlay.querySelector("#chat-report-close").addEventListener("click", closeSheet);
    overlay.addEventListener("click", (e) => { if (e.target === overlay) closeSheet(); });

    submitBtn.addEventListener("click", () => {
      const selectedReason = overlay.querySelector("input[name='chat-report-reason']:checked");
      const details = (overlay.querySelector("#chat-report-details")?.value || "").trim();
      if (!selectedReason) return;

      const user = currentUser();
      // Store the user report in DB
      if (!Array.isArray(DB.userReports)) DB.userReports = [];
      DB.userReports.push({
        id: Date.now(),
        reporterId: user.id,
        reportedUserId: reportedUser.id,
        conversationId: convo?.id || null,
        reason: selectedReason.value,
        details,
        status: "pending",
        createdAt: Date.now(),
      });

      // Notify admin users
      DB.users.filter((u) => u.role === "admin").forEach((admin) => {
        pushNotification({
          userId: admin.id,
          type: "moderation",
          title: "User report received",
          body: `${user.name} reported ${reportedUser.name}: ${selectedReason.value}`,
          link: "#/admin",
        });
      });

      saveDB();
      recordAudit("user_reported", { reporterId: user.id, reportedUserId: reportedUser.id, reason: selectedReason.value });
      overlay.remove();
      showToast("Report submitted. Thank you for keeping the community safe.");
    });
  }

  // ---------------------------------------------------------
  // Feedback & Report a Problem (Settings)
  // ---------------------------------------------------------
  function showFeedbackModal() {
    const existing = document.getElementById("feedback-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "feedback-modal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex;";

    overlay.innerHTML = `
      <div class="modal-box" style="max-width:440px;width:100%;max-height:90vh;overflow-y:auto" role="dialog" aria-modal="true">
        <div class="modal-icon" style="background:#E8F3EF;color:var(--forest)">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
        </div>
        <h3 class="modal-title font-fraunces">Send Feedback</h3>
        <p style="font-size:13.5px;color:var(--muted);margin-bottom:16px">We'd love to hear what you think — good or bad. Your feedback helps us improve BentaLink.</p>

        <div class="field" style="margin-bottom:12px">
          <label style="font-size:13px;font-weight:600;margin-bottom:8px;display:block">How are you feeling about the app?</label>
          <div class="feedback-emoji-row" id="feedback-emoji-row">
            ${[["😡","Terrible"],["😕","Not great"],["😐","Okay"],["🙂","Good"],["😍","Love it"]].map(([e, l], i) => `
              <button type="button" class="feedback-emoji-btn" data-rating="${i+1}" title="${l}">
                <span class="feedback-emoji">${e}</span>
                <span class="feedback-emoji-label">${l}</span>
              </button>`).join("")}
          </div>
        </div>

        <div class="field" style="margin-bottom:12px">
          <label style="font-size:13px;font-weight:600;margin-bottom:6px;display:block">What's on your mind?</label>
          <textarea id="feedback-message" rows="4" placeholder="Share your thoughts, ideas, or suggestions…" style="width:100%;padding:10px 12px;border:1.5px solid var(--tan-border);border-radius:10px;font-size:14px;resize:vertical"></textarea>
        </div>

        <div class="field" style="margin-bottom:18px">
          <label style="font-size:13px;font-weight:600;margin-bottom:6px;display:block">Feature you'd like to see? <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
          <input type="text" id="feedback-feature" placeholder="e.g. Dark mode, image gallery, location map…" style="width:100%;padding:10px 12px;border:1.5px solid var(--tan-border);border-radius:10px;font-size:14px" />
        </div>

        <div class="modal-actions">
          <button class="btn btn--outline" id="feedback-cancel">Cancel</button>
          <button class="btn btn--forest" id="feedback-submit">Send feedback</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    let selectedRating = 0;
    overlay.querySelectorAll(".feedback-emoji-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        selectedRating = parseInt(btn.getAttribute("data-rating"), 10);
        overlay.querySelectorAll(".feedback-emoji-btn").forEach((b) => b.classList.remove("selected"));
        btn.classList.add("selected");
      });
    });

    overlay.querySelector("#feedback-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#feedback-submit").addEventListener("click", () => {
      const message = (overlay.querySelector("#feedback-message")?.value || "").trim();
      const feature = (overlay.querySelector("#feedback-feature")?.value || "").trim();
      if (!message) { showToast("Please write something before sending."); return; }

      if (!Array.isArray(DB.feedbacks)) DB.feedbacks = [];
      const user = currentUser();
      DB.feedbacks.push({
        id: Date.now(),
        userId: user?.id || null,
        rating: selectedRating,
        message,
        featureRequest: feature,
        createdAt: Date.now(),
      });
      saveDB();
      overlay.remove();
      showToast("Thank you for your feedback! 🙏");
    });
  }

  function showReportProblemModal() {
    const existing = document.getElementById("report-problem-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "report-problem-modal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex;";

    const PROBLEM_TYPES = [
      "App crash or freeze",
      "Feature not working",
      "Loading or performance issue",
      "Payment or reservation issue",
      "Messages not sending",
      "Content or display problem",
      "Other",
    ];

    overlay.innerHTML = `
      <div class="modal-box" style="max-width:440px;width:100%;max-height:90vh;overflow-y:auto" role="dialog" aria-modal="true">
        <div class="modal-icon modal-icon--warning">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.3 3.7 1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>
        </div>
        <h3 class="modal-title font-fraunces">Report a Problem</h3>
        <p style="font-size:13.5px;color:var(--muted);margin-bottom:16px">Tell us what went wrong and we'll look into it as soon as possible.</p>

        <div class="field" style="margin-bottom:12px">
          <label style="font-size:13px;font-weight:600;margin-bottom:8px;display:block">Problem type</label>
          <select id="problem-type" style="width:100%;padding:10px 12px;border:1.5px solid var(--tan-border);border-radius:10px;font-size:14px;background:var(--cream)">
            <option value="">Select a problem type…</option>
            ${PROBLEM_TYPES.map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("")}
          </select>
        </div>

        <div class="field" style="margin-bottom:12px">
          <label style="font-size:13px;font-weight:600;margin-bottom:6px;display:block">Describe the problem</label>
          <textarea id="problem-description" rows="4" placeholder="What happened? What were you trying to do when it occurred?" style="width:100%;padding:10px 12px;border:1.5px solid var(--tan-border);border-radius:10px;font-size:14px;resize:vertical"></textarea>
        </div>

        <div class="field" style="margin-bottom:18px">
          <label style="font-size:13px;font-weight:600;margin-bottom:6px;display:block">Steps to reproduce <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
          <textarea id="problem-steps" rows="3" placeholder="1. I tapped on…&#10;2. Then I…&#10;3. And the app…" style="width:100%;padding:10px 12px;border:1.5px solid var(--tan-border);border-radius:10px;font-size:14px;resize:vertical"></textarea>
        </div>

        <p style="font-size:12px;color:var(--muted);background:var(--sand);border-radius:10px;padding:10px 12px;margin-bottom:16px">Your report includes your account info and is sent to our support team. We may follow up via email.</p>

        <div class="modal-actions">
          <button class="btn btn--outline" id="problem-cancel">Cancel</button>
          <button class="btn btn--coral" id="problem-submit">Submit report</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);
    overlay.querySelector("#problem-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#problem-submit").addEventListener("click", () => {
      const type = overlay.querySelector("#problem-type").value;
      const description = (overlay.querySelector("#problem-description")?.value || "").trim();
      const steps = (overlay.querySelector("#problem-steps")?.value || "").trim();

      if (!type) { showToast("Please select a problem type."); return; }
      if (!description) { showToast("Please describe the problem."); return; }

      if (!Array.isArray(DB.problemReports)) DB.problemReports = [];
      const user = currentUser();
      DB.problemReports.push({
        id: Date.now(),
        userId: user?.id || null,
        type,
        description,
        steps,
        createdAt: Date.now(),
      });

      DB.users.filter((u) => u.role === "admin").forEach((admin) => {
        pushNotification({
          userId: admin.id,
          type: "moderation",
          title: "Problem report submitted",
          body: `${user?.name || "A user"} reported: ${type}`,
          link: "#/admin",
        });
      });

      saveDB();
      overlay.remove();
      showToast("Problem reported! Our team will look into it.");
    });
  }

  // Trade toggle show/hide on post form
  const postTradeToggle = document.getElementById("post-open-for-trade");
  const postTradeForField = document.getElementById("post-trade-for-field");
  if (postTradeToggle && postTradeForField) {
    postTradeToggle.addEventListener("change", () => {
      postTradeForField.style.display = postTradeToggle.checked ? "block" : "none";
    });
  }

  // ---------------------------------------------------------
  // Trade Request helpers
  // ---------------------------------------------------------
  function ensureTradeRequests() {
    if (!Array.isArray(DB.tradeRequests)) DB.tradeRequests = [];
    if (typeof DB.meta.tradeRequests !== 'number') DB.meta.tradeRequests = DB.tradeRequests.length;
    return DB.tradeRequests;
  }

  function createTradeRequest(opts) {
    ensureTradeRequests();
    const existing = DB.tradeRequests.find(
      (r) => r.requesterId === opts.requesterId && r.targetListingId === opts.targetListingId && r.status === 'pending'
    );
    if (existing) return { error: 'duplicate', request: existing };

    const req = {
      id: nextId("tradeRequests"),
      requesterId: opts.requesterId,
      targetListingId: opts.targetListingId,    // the item being offered TO
      offeredListingId: opts.offeredListingId,  // the item being offered BY requester
      offeredText: opts.offeredText || "",      // free-text offer if no listing
      offeredPhoto: opts.offeredPhoto || "",    // optional photo uploaded by requester
      message: opts.message || "",
      status: 'pending',  // pending | accepted | rejected | cancelled
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    DB.tradeRequests.push(req);

    const targetListing = getListing(opts.targetListingId);
    if (targetListing) {
      pushNotification({
        userId: targetListing.sellerId,
        type: 'trade',
        title: 'New trade request',
        body: `Someone wants to trade for your "${targetListing.title}".`,
        link: '#/mytrades',
        listingId: opts.targetListingId,
      });
      const convo = findOrCreateConversation(opts.requesterId, targetListing.sellerId, opts.targetListingId);
      if (opts.message) sendMessage(convo.id, opts.requesterId, `[Trade Request] ${opts.message}`);
    }

    saveDB();
    recordAudit('trade_request_created', { tradeRequestId: req.id, requesterId: req.requesterId, targetListingId: req.targetListingId });
    return { request: req };
  }

  function updateTradeRequest(requestId, newStatus, responderId) {
    ensureTradeRequests();
    const req = DB.tradeRequests.find((r) => r.id === requestId);
    if (!req) return null;
    req.status = newStatus;
    req.updatedAt = Date.now();

    const targetListing = getListing(req.targetListingId);
    const requester = getUser(req.requesterId);

    if (newStatus === 'accepted') {
      pushNotification({
        userId: req.requesterId,
        type: 'trade',
        title: 'Trade request accepted!',
        body: `Your trade offer for "${targetListing?.title}" was accepted. Message the seller to coordinate.`,
        link: '#/mytrades',
        listingId: req.targetListingId,
      });
      if (targetListing) {
        const convo = findOrCreateConversation(req.requesterId, targetListing.sellerId, req.targetListingId);
        sendMessage(convo.id, responderId, `[Trade Accepted] Your offer has been accepted! Let\'s coordinate the exchange.`);
      }
    } else if (newStatus === 'rejected') {
      pushNotification({
        userId: req.requesterId,
        type: 'trade',
        title: 'Trade request declined',
        body: `Your trade offer for "${targetListing?.title}" was not accepted this time.`,
        link: '#/mytrades',
        listingId: req.targetListingId,
      });
    }

    saveDB();
    recordAudit('trade_request_updated', { tradeRequestId: req.id, newStatus, responderId });
    return req;
  }

  function getTradeRequestsForUser(userId) {
    ensureTradeRequests();
    return DB.tradeRequests
      .filter((r) => {
        const tl = getListing(r.targetListingId);
        return r.requesterId === userId || (tl && tl.sellerId === userId);
      })
      .map((r) => ({
        ...r,
        targetListing: getListing(r.targetListingId),
        offeredListing: r.offeredListingId ? getListing(r.offeredListingId) : null,
        requester: getUser(r.requesterId),
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  }

  // ---------------------------------------------------------
  // Screen: Trade Board
  // ---------------------------------------------------------
  const TRADE_CATEGORIES = ["All","Food & Drinks","Devices & Electronics","Clothes & Fashion","Crafts & Handmade","Pre-loved Items","Services","Home & Living","Books & School","Sports & Outdoors","Beauty & Health","Toys & Kids","Vehicles & Parts","Pet Supplies","Agriculture & Plants"];
  let tradeState = { searchTerm: "", category: "All" };

  function renderTrade() {
    const catList = document.getElementById("trade-categories");
    catList.innerHTML = "";
    TRADE_CATEGORIES.forEach((cat) => {
      const item = document.createElement("button");
      item.className = "category-list__item" + (tradeState.category === cat ? " active" : "");
      item.textContent = cat;
      item.addEventListener("click", () => { tradeState.category = cat; renderTrade(); });
      catList.appendChild(item);
    });

    const chipRow = document.getElementById("trade-chips");
    chipRow.innerHTML = "";
    TRADE_CATEGORIES.forEach((cat) => {
      const chip = document.createElement("button");
      chip.className = "chip" + (tradeState.category === cat ? " active" : "");
      chip.textContent = cat;
      chip.addEventListener("click", () => { tradeState.category = cat; renderTrade(); });
      chipRow.appendChild(chip);
    });

    const searchInput = document.getElementById("trade-search");
    if (searchInput.value !== tradeState.searchTerm) searchInput.value = tradeState.searchTerm;
    searchInput.oninput = (e) => { tradeState.searchTerm = e.target.value; renderTradeResults(); };

    const myBtn = document.getElementById("trade-my-trades-btn");
    if (myBtn) {
      myBtn.onclick = () => {
        if (!isAuthenticated()) { showToast("Please log in to view your trade requests."); navigate("#/signin"); return; }
        navigate("#/mytrades");
      };
    }

    renderTradeResults();
  }

  function renderTradeResults() {
    const results = searchListings(tradeState.searchTerm, tradeState.category, { tradeOnly: true });
    const countEl = document.getElementById("trade-count");
    if (countEl) countEl.textContent = `${results.length} item${results.length !== 1 ? "s" : ""} open for trade`;

    const grid = document.getElementById("trade-list");
    grid.innerHTML = "";

    if (results.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <p class="empty-state__title">No items available for trade</p>
          <p class="empty-state__sub">Post an item and toggle "Open for trade" to list it here.</p>
          <button class="btn btn--forest" style="margin-top:12px" data-nav="post">Post a trade item</button>
        </div>`;
      injectIcons(grid);
      return;
    }

    results.forEach((listing) => {
      const card = document.createElement("div");
      card.className = "listing-card trade-card";
      const tradeTag = listing.tradeFor
        ? `<span class="trade-tag">Wants: ${escapeHtml(listing.tradeFor)}</span>`
        : `<span class="trade-tag">Open to offers</span>`;
      card.innerHTML = `
        <div class="listing-card__media">
          ${listingImageMarkup(listing, "listing-card__img")}
          <span class="status-ribbon status-ribbon--trade">Trade</span>
        </div>
        <div class="listing-card__body">
          <h3 class="listing-card__title">${escapeHtml(listing.title)}</h3>
          <p class="listing-card__price">₱${escapeHtml(listing.price)} <span class="listing-card__price-note">or trade</span></p>
          ${tradeTag}
          <p class="listing-card__desc">${escapeHtml(listing.description)}</p>
          <p class="listing-card__loc">${ICONS.mapPin} ${escapeHtml(listing.location)}</p>
          <button class="btn btn--forest btn--block trade-offer-btn" style="margin-top:10px" data-trade-listing="${listing.id}">Make a trade offer</button>
        </div>`;
      card.querySelector(".listing-card__media").addEventListener("click", () => navigate(`#/item/${listing.id}`));
      card.querySelector("h3").addEventListener("click", () => navigate(`#/item/${listing.id}`));
      card.querySelector(".trade-offer-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        showTradeOfferModal(listing);
      });
      grid.appendChild(card);
    });
  }

  // ---------------------------------------------------------
  // Trade Offer Modal
  // ---------------------------------------------------------
  function showTradeOfferModal(targetListing) {
    if (!isAuthenticated()) {
      showToast("Please log in to make a trade offer.");
      navigate("#/signin");
      return;
    }
    const user = currentUser();
    if (user.id === targetListing.sellerId) {
      showToast("This is your own listing.");
      return;
    }

    // My listings that are available
    const myListings = DB.listings.filter(
      (l) => l.sellerId === user.id && isListingAvailable(l)
    );

    const existing = document.getElementById("trade-offer-modal");
    if (existing) existing.remove();

    // State for optional offer photo
    const tradeOfferPhotoState = { dataUrl: "", fileName: "" };

    const overlay = document.createElement("div");
    overlay.id = "trade-offer-modal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex;";

    overlay.innerHTML = `
      <div class="modal-box" style="max-width:480px;width:100%;max-height:90vh;overflow-y:auto" role="dialog" aria-modal="true">
        <h3 class="modal-title font-fraunces" style="margin-bottom:4px">Make a trade offer</h3>
        <p style="font-size:13.5px;color:var(--muted);margin-bottom:18px">You're offering something for <strong>${escapeHtml(targetListing.title)}</strong></p>

        <div class="field" style="margin-bottom:14px">
          <label style="font-size:13px;font-weight:600;margin-bottom:6px;display:block">What will you offer?</label>
          ${myListings.length > 0 ? `
          <div class="trade-offer-tabs">
            <button type="button" class="trade-offer-tab active" data-tab="listing">My listings</button>
            <button type="button" class="trade-offer-tab" data-tab="text">Describe offer</button>
          </div>
          <div id="trade-tab-listing" class="trade-tab-panel">
            <select id="trade-offer-listing-select" style="width:100%;padding:10px 12px;border:1.5px solid var(--tan-border);border-radius:10px;font-size:14px;background:var(--cream)">
              <option value="">Select one of your listings…</option>
              ${myListings.map((l) => `<option value="${l.id}">${escapeHtml(l.title)} (₱${escapeHtml(l.price)})</option>`).join("")}
            </select>
          </div>
          <div id="trade-tab-text" class="trade-tab-panel" style="display:none">
            <input type="text" id="trade-offer-text-input" placeholder="e.g. Vintage watch, guitar, old textbooks" style="width:100%;padding:10px 12px;border:1.5px solid var(--tan-border);border-radius:10px;font-size:14px;margin-bottom:10px" />
            <div class="trade-offer-photo-field">
              <label style="font-size:12.5px;font-weight:600;color:var(--muted);margin-bottom:6px;display:block">Photo of your offer <span style="font-weight:400">(optional — helps the seller know what you mean)</span></label>
              <label class="trade-offer-photo-btn" for="trade-offer-photo-input">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
                Add photo
              </label>
              <input type="file" id="trade-offer-photo-input" accept="image/*" style="display:none" />
              <div class="trade-offer-photo-preview" id="trade-offer-photo-preview">
                <p class="trade-offer-photo-preview__empty">No photo added</p>
              </div>
            </div>
          </div>` : `
          <input type="text" id="trade-offer-text-input" placeholder="e.g. Vintage watch, guitar, old textbooks" style="width:100%;padding:10px 12px;border:1.5px solid var(--tan-border);border-radius:10px;font-size:14px;margin-bottom:10px" />
          <div class="trade-offer-photo-field">
            <label style="font-size:12.5px;font-weight:600;color:var(--muted);margin-bottom:6px;display:block">Photo of your offer <span style="font-weight:400">(optional)</span></label>
            <label class="trade-offer-photo-btn" for="trade-offer-photo-input">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
              Add photo
            </label>
            <input type="file" id="trade-offer-photo-input" accept="image/*" style="display:none" />
            <div class="trade-offer-photo-preview" id="trade-offer-photo-preview">
              <p class="trade-offer-photo-preview__empty">No photo added</p>
            </div>
          </div>
          `}
        </div>

        <div class="field" style="margin-bottom:18px">
          <label style="font-size:13px;font-weight:600;margin-bottom:6px;display:block">Message to seller <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
          <textarea id="trade-offer-message" rows="3" placeholder="Tell the seller a bit about yourself or your item…" style="width:100%;padding:10px 12px;border:1.5px solid var(--tan-border);border-radius:10px;font-size:14px;resize:vertical"></textarea>
        </div>

        <div class="modal-actions">
          <button class="btn btn--outline" id="trade-modal-cancel">Cancel</button>
          <button class="btn btn--forest" id="trade-modal-submit">Send trade offer</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    // Trade offer photo input handler
    const tradePhotoInput = overlay.querySelector("#trade-offer-photo-input");
    const tradePhotoPreview = overlay.querySelector("#trade-offer-photo-preview");
    if (tradePhotoInput && tradePhotoPreview) {
      tradePhotoInput.addEventListener("change", () => {
        const file = tradePhotoInput.files && tradePhotoInput.files[0];
        if (!file) {
          tradeOfferPhotoState.dataUrl = "";
          tradeOfferPhotoState.fileName = "";
          tradePhotoPreview.innerHTML = `<p class="trade-offer-photo-preview__empty">No photo added</p>`;
          return;
        }
        if (!file.type.startsWith("image/")) {
          showToast("Please choose an image file.");
          tradePhotoInput.value = "";
          return;
        }
        if (file.size > 1.5 * 1024 * 1024) {
          showToast("Photo is too large. Max 1.5 MB.");
          tradePhotoInput.value = "";
          return;
        }
        const reader = new FileReader();
        reader.onload = () => {
          tradeOfferPhotoState.dataUrl = String(reader.result || "");
          tradeOfferPhotoState.fileName = file.name;
          tradePhotoPreview.innerHTML = `
            <div class="trade-offer-photo-preview__wrap">
              <img src="${escapeHtml(tradeOfferPhotoState.dataUrl)}" alt="Offer photo preview" />
              <button type="button" class="trade-offer-photo-preview__remove" id="trade-photo-remove">✕ Remove</button>
            </div>`;
          tradePhotoPreview.querySelector("#trade-photo-remove")?.addEventListener("click", () => {
            tradeOfferPhotoState.dataUrl = "";
            tradeOfferPhotoState.fileName = "";
            tradePhotoInput.value = "";
            tradePhotoPreview.innerHTML = `<p class="trade-offer-photo-preview__empty">No photo added</p>`;
          });
        };
        reader.readAsDataURL(file);
      });
    }
    const tabs = overlay.querySelectorAll(".trade-offer-tab");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const which = tab.getAttribute("data-tab");
        const listingPanel = overlay.querySelector("#trade-tab-listing");
        const textPanel = overlay.querySelector("#trade-tab-text");
        if (listingPanel) listingPanel.style.display = which === "listing" ? "block" : "none";
        if (textPanel) textPanel.style.display = which === "text" ? "block" : "none";
      });
    });

    overlay.querySelector("#trade-modal-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector("#trade-modal-submit").addEventListener("click", () => {
      const activeTab = overlay.querySelector(".trade-offer-tab.active");
      const isListingTab = activeTab && activeTab.getAttribute("data-tab") === "listing";
      const selectEl = overlay.querySelector("#trade-offer-listing-select");
      const textEl = overlay.querySelector("#trade-offer-text-input");
      const msgEl = overlay.querySelector("#trade-offer-message");

      let offeredListingId = null;
      let offeredText = "";

      if (myListings.length > 0 && isListingTab) {
        offeredListingId = selectEl ? parseInt(selectEl.value, 10) || null : null;
        if (!offeredListingId) { showToast("Please select one of your listings to offer."); return; }
      } else {
        offeredText = (textEl?.value || "").trim();
        if (!offeredText) { showToast("Please describe what you're offering."); return; }
      }

      const message = (msgEl?.value || "").trim();
      const result = createTradeRequest({
        requesterId: user.id,
        targetListingId: targetListing.id,
        offeredListingId,
        offeredText,
        offeredPhoto: offeredListingId ? "" : (tradeOfferPhotoState.dataUrl || ""),
        message,
      });

      if (result.error === 'duplicate') {
        showToast("You already have a pending trade request for this item.");
        overlay.remove();
        return;
      }

      overlay.remove();
      showToast("Trade offer sent! The seller has been notified.");
    });
  }

  // ---------------------------------------------------------
  // Screen: My Trades
  // ---------------------------------------------------------
  function renderMyTrades() {
    const page = document.getElementById("mytrades-page");

    if (!isAuthenticated()) {
      page.innerHTML = `
        <div class="empty-state" style="padding-top:80px">
          <p class="empty-state__title">Please log in</p>
          <p class="empty-state__sub">Sign in to view your trade requests.</p>
          <button class="btn btn--coral" style="margin-top:12px" data-nav="signin">Sign in</button>
        </div>`;
      injectIcons(page);
      return;
    }

    const user = currentUser();
    const allRequests = getTradeRequestsForUser(user.id);
    const incoming = allRequests.filter((r) => r.targetListing && r.targetListing.sellerId === user.id && r.requesterId !== user.id);
    const outgoing = allRequests.filter((r) => r.requesterId === user.id);

    function statusPill(status) {
      const map = { pending: 'trade-pill--pending', accepted: 'trade-pill--accepted', rejected: 'trade-pill--rejected', cancelled: 'trade-pill--cancelled' };
      return `<span class="trade-pill ${map[status] || ''}">${escapeHtml(status)}</span>`;
    }

    function requestCard(req, isIncoming) {
      const otherUser = isIncoming ? req.requester : getUser(req.targetListing?.sellerId);

      // Thumbnails: target item on one side, offered item on the other
      const targetImgSrc = req.targetListing ? escapeHtml(getListingImageSrc(req.targetListing)) : "";
      const offeredImgSrc = req.offeredListing
        ? escapeHtml(getListingImageSrc(req.offeredListing))
        : (req.offeredPhoto ? escapeHtml(req.offeredPhoto) : "");

      const offerLabel = req.offeredListing
        ? `<strong>${escapeHtml(req.offeredListing.title)}</strong><span class="trade-card-thumb__price">₱${escapeHtml(String(req.offeredListing.price))}</span>`
        : `<em>${escapeHtml(req.offeredText || "No details provided")}</em>`;

      const targetLabel = req.targetListing
        ? `<strong>${escapeHtml(req.targetListing.title)}</strong><span class="trade-card-thumb__price">₱${escapeHtml(String(req.targetListing.price || ""))}</span>`
        : "Unknown item";

      const thumbsHtml = `
        <div class="trade-card-thumbs">
          <div class="trade-card-thumb">
            ${offeredImgSrc
              ? `<img src="${offeredImgSrc}" alt="Offered item" class="trade-card-thumb__img" />`
              : `<div class="trade-card-thumb__img trade-card-thumb__img--empty"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg></div>`
            }
            <div class="trade-card-thumb__label">
              <span class="trade-card-thumb__tag">Offering</span>
              ${offerLabel}
            </div>
          </div>
          <div class="trade-card-thumbs__arrow">⇄</div>
          <div class="trade-card-thumb">
            ${targetImgSrc
              ? `<img src="${targetImgSrc}" alt="Target item" class="trade-card-thumb__img" />`
              : `<div class="trade-card-thumb__img trade-card-thumb__img--empty"></div>`
            }
            <div class="trade-card-thumb__label">
              <span class="trade-card-thumb__tag">For</span>
              ${targetLabel}
            </div>
          </div>
        </div>`;

      let actions = "";
      if (isIncoming && req.status === 'pending') {
        actions = `
          <button class="btn btn--forest btn--sm" data-trade-accept="${req.id}">Accept</button>
          <button class="btn btn--outline btn--sm" data-trade-reject="${req.id}">Decline</button>
          <button class="btn btn--outline btn--sm" data-trade-chat="${req.id}">Open chat</button>`;
      } else if (!isIncoming && req.status === 'accepted') {
        actions = `<button class="btn btn--outline btn--sm" data-trade-chat="${req.id}">Open chat</button>`;
      } else if (!isIncoming && req.status === 'pending') {
        actions = `
          <button class="btn btn--outline btn--sm" data-trade-cancel="${req.id}">Cancel offer</button>
          <button class="btn btn--outline btn--sm" data-trade-chat="${req.id}">Open chat</button>`;
      }

      return `
        <div class="trade-request-card">
          <div class="trade-request-card__top">
            <div class="trade-request-card__meta">
              <p class="trade-request-card__who">
                ${isIncoming
                  ? `<strong>${escapeHtml(otherUser?.name || "Someone")}</strong> wants to trade with you`
                  : `Trade offer to <strong>${escapeHtml(otherUser?.name || "Seller")}</strong>`
                }
              </p>
              ${thumbsHtml}
              ${req.message ? `<p class="trade-request-card__msg">"${escapeHtml(req.message)}"</p>` : ""}
              <p class="trade-request-card__time">${timeAgo(req.createdAt)} ago</p>
            </div>
            ${statusPill(req.status)}
          </div>
          ${actions ? `<div class="trade-request-card__actions">${actions}</div>` : ""}
        </div>`;
    }

    page.innerHTML = `
      <div class="page-header">
        <button class="link-btn" data-nav="trade">← Back to Trade Board</button>
        <h1 class="font-fraunces">My Trade Requests</h1>
        <p>Manage incoming and outgoing trade offers.</p>
      </div>
      <div class="dashboard-card" style="margin-bottom:18px">
        <h2 class="section-heading">Incoming offers <span style="font-size:13px;font-weight:500;color:var(--muted)">(${incoming.length})</span></h2>
        <div class="trade-requests-list">
          ${incoming.length ? incoming.map((r) => requestCard(r, true)).join("") : `<div class="empty-state"><p class="empty-state__title">No incoming offers yet</p><p class="empty-state__sub">When someone wants to trade for your item, their request appears here.</p></div>`}
        </div>
      </div>
      <div class="dashboard-card">
        <h2 class="section-heading">My offers <span style="font-size:13px;font-weight:500;color:var(--muted)">(${outgoing.length})</span></h2>
        <div class="trade-requests-list">
          ${outgoing.length ? outgoing.map((r) => requestCard(r, false)).join("") : `<div class="empty-state"><p class="empty-state__title">You haven't made any offers yet</p><p class="empty-state__sub">Browse the <button class="link-btn" data-nav="trade">Trade Board</button> and make an offer on something you like.</p></div>`}
        </div>
      </div>
    `;

    injectIcons(page);

    page.querySelectorAll("[data-trade-accept]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reqId = parseInt(btn.getAttribute("data-trade-accept"), 10);
        showConfirmModal({
          icon: "warning",
          title: "Accept this trade offer?",
          body: "The requester will be notified and a chat will open so you can coordinate the exchange.",
          confirmLabel: "Yes, accept",
          confirmClass: "btn--forest",
          onConfirm: () => {
            updateTradeRequest(reqId, 'accepted', user.id);
            showToast("Trade offer accepted! Chat with the requester to finalize.");
            renderMyTrades();
          },
        });
      });
    });

    page.querySelectorAll("[data-trade-reject]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reqId = parseInt(btn.getAttribute("data-trade-reject"), 10);
        showConfirmModal({
          icon: "danger",
          title: "Decline this trade offer?",
          body: "The requester will be notified that their offer was not accepted.",
          confirmLabel: "Yes, decline",
          confirmClass: "btn--coral",
          onConfirm: () => {
            updateTradeRequest(reqId, 'rejected', user.id);
            showToast("Trade offer declined.");
            renderMyTrades();
          },
        });
      });
    });

    page.querySelectorAll("[data-trade-cancel]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reqId = parseInt(btn.getAttribute("data-trade-cancel"), 10);
        showConfirmModal({
          icon: "warning",
          title: "Cancel your trade offer?",
          body: "Your offer will be withdrawn.",
          confirmLabel: "Yes, cancel",
          confirmClass: "btn--coral",
          onConfirm: () => {
            updateTradeRequest(reqId, 'cancelled', user.id);
            showToast("Trade offer cancelled.");
            renderMyTrades();
          },
        });
      });
    });

    page.querySelectorAll("[data-trade-chat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const reqId = parseInt(btn.getAttribute("data-trade-chat"), 10);
        const req = DB.tradeRequests.find((r) => r.id === reqId);
        if (!req) return;
        const targetListing = getListing(req.targetListingId);
        if (!targetListing) return;
        const convo = findOrCreateConversation(req.requesterId, targetListing.sellerId, req.targetListingId);
        navigate(`#/chat/${convo.id}`);
      });
    });
  }

  // ---------------------------------------------------------
  // Rate Seller Modal
  // ---------------------------------------------------------
  function showRateSellerModal(order, seller, onDone) {
    const existing = document.getElementById("rate-seller-modal");
    if (existing) existing.remove();

    const overlay = document.createElement("div");
    overlay.id = "rate-seller-modal";
    overlay.className = "modal-overlay";
    overlay.style.cssText = "display:flex;";

    let selectedStars = 0;

    overlay.innerHTML = `
      <div class="modal-box" style="max-width:420px;width:100%" role="dialog" aria-modal="true">
        <div class="modal-icon" style="background:#FEF6E7;color:#92660B">
          ${ICONS.star}
        </div>
        <h3 class="modal-title font-fraunces">Rate the Seller</h3>
        <p style="font-size:13.5px;color:var(--muted);margin-bottom:16px">How was your experience with <strong>${escapeHtml(seller?.name || "the seller")}</strong>?</p>

        <div class="rate-stars-row" id="rate-stars-row" style="display:flex;gap:10px;justify-content:center;margin-bottom:18px">
          ${[1,2,3,4,5].map((n) => `
            <button type="button" class="rate-star-btn" data-star="${n}" style="font-size:30px;background:none;border:none;cursor:pointer;color:#D1C9BE;transition:color .15s" aria-label="${n} star${n>1?"s":""}">★</button>
          `).join("")}
        </div>

        <div class="field" style="margin-bottom:18px">
          <label style="font-size:13px;font-weight:600;margin-bottom:6px;display:block">Leave a comment <span style="font-weight:400;color:var(--muted)">(optional)</span></label>
          <textarea id="rate-seller-comment" rows="3" placeholder="Share your experience with this seller…" style="width:100%;padding:10px 12px;border:1.5px solid var(--tan-border);border-radius:10px;font-size:14px;resize:vertical"></textarea>
        </div>

        <div class="modal-actions">
          <button class="btn btn--outline" id="rate-seller-cancel">Cancel</button>
          <button class="btn btn--forest" id="rate-seller-submit" disabled style="opacity:.5">Submit Rating</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const submitBtn = overlay.querySelector("#rate-seller-submit");
    const starBtns = overlay.querySelectorAll(".rate-star-btn");

    function updateStars(val) {
      selectedStars = val;
      starBtns.forEach((btn) => {
        const n = parseInt(btn.getAttribute("data-star"), 10);
        btn.style.color = n <= val ? "#F5A623" : "#D1C9BE";
      });
      submitBtn.disabled = val === 0;
      submitBtn.style.opacity = val === 0 ? ".5" : "1";
    }

    starBtns.forEach((btn) => {
      btn.addEventListener("mouseenter", () => {
        const n = parseInt(btn.getAttribute("data-star"), 10);
        starBtns.forEach((b) => {
          b.style.color = parseInt(b.getAttribute("data-star"), 10) <= n ? "#F5A623" : "#D1C9BE";
        });
      });
      btn.addEventListener("mouseleave", () => updateStars(selectedStars));
      btn.addEventListener("click", () => updateStars(parseInt(btn.getAttribute("data-star"), 10)));
    });

    overlay.querySelector("#rate-seller-cancel").addEventListener("click", () => overlay.remove());
    overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

    submitBtn.addEventListener("click", () => {
      if (selectedStars === 0) return;
      const comment = (overlay.querySelector("#rate-seller-comment")?.value || "").trim();

      // Save the rating
      if (!Array.isArray(DB.sellerRatings)) DB.sellerRatings = [];
      DB.sellerRatings.push({
        id: Date.now(),
        reservationId: order.id,
        buyerId: order.buyerId,
        sellerId: seller?.id || null,
        stars: selectedStars,
        comment,
        createdAt: Date.now(),
      });

      // Mark order as rated
      const res = DB.reservations.find((r) => r.id === order.id);
      if (res) res.sellerRated = true;

      // Update seller's average rating
      if (seller) {
        const allRatings = DB.sellerRatings.filter((r) => r.sellerId === seller.id);
        const avg = allRatings.reduce((sum, r) => sum + r.stars, 0) / allRatings.length;
        seller.averageRating = Math.round(avg * 10) / 10;
        seller.ratingCount = allRatings.length;
      }

      // Notify seller
      if (seller) {
        pushNotification({
          userId: seller.id,
          type: "order",
          title: "New rating received",
          body: `You received a ${selectedStars}-star rating${comment ? `: "${comment.slice(0, 60)}"` : "."}`,
          link: "#/profile",
        });
      }

      saveDB();
      overlay.remove();
      showToast(`Thanks for your ${selectedStars}-star rating!`);
      onDone && onDone();
    });
  }

  // ---------------------------------------------------------
  // Boot
  // ---------------------------------------------------------
  injectIcons(document);
  renderRoute();
})();