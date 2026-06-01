(function () {
  "use strict";

  const app = {
    companies: [],
    filtered: [],
    charts: {},
    page: document.body.dataset.page || "home",
    directory: {
      page: 1,
      pageSize: 12,
      view: "all",
      sort: "relevance",
      observer: null,
    },
    storage: {
      bookmarks: "india-directory-bookmarks",
      recent: "india-directory-recent",
      theme: "india-directory-theme",
      cache: "india-directory-cache",
      cacheVersion: "india-directory-cache-version",
    },
    cacheConfig: {
      version: "v1.0", // Increment this when data structure changes
      expiryDays: 7, // Cache expires after 7 days
    },
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    document.body.classList.add("app-ready");
    bindShell();
    setupRevealAnimations();
    setupBackToTop();

    try {
      // Try to load from cache first
      const cachedData = loadFromCache();
      
      if (cachedData) {
        console.log("✅ Loading from cache (instant load)");
        app.companies = cachedData.map(normalizeCompany);
        routePage();
        
        // Fetch fresh data in background and update cache
        fetchAndUpdateCache();
      } else {
        console.log("📥 Loading from server (first time)");
        await fetchAndLoadData();
      }
    } catch (error) {
      renderLoadError(error);
    }
  }

  async function fetchAndLoadData() {
    const response = await fetch("companies.json", { 
      cache: "no-store",
      headers: {
        'Accept-Encoding': 'gzip, deflate, br'
      }
    });
    if (!response.ok) throw new Error("companies.json could not be loaded");
    
    const data = await response.json();
    app.companies = data.map(normalizeCompany);
    
    // Save to cache for next time
    saveToCache(data);
    
    routePage();
  }

  async function fetchAndUpdateCache() {
    try {
      const response = await fetch("companies.json", { 
        cache: "no-store",
        headers: {
          'Accept-Encoding': 'gzip, deflate, br'
        }
      });
      if (response.ok) {
        const data = await response.json();
        saveToCache(data);
        console.log("🔄 Cache updated in background");
      }
    } catch (error) {
      console.warn("Background cache update failed:", error);
    }
  }

  function saveToCache(data) {
    try {
      const cacheData = {
        version: app.cacheConfig.version,
        timestamp: Date.now(),
        data: data,
      };
      localStorage.setItem(app.storage.cache, JSON.stringify(cacheData));
      localStorage.setItem(app.storage.cacheVersion, app.cacheConfig.version);
      console.log("💾 Data cached successfully");
    } catch (error) {
      console.warn("Failed to cache data:", error);
      // If localStorage is full, clear old cache
      if (error.name === 'QuotaExceededError') {
        clearCache();
      }
    }
  }

  function loadFromCache() {
    try {
      const cachedVersion = localStorage.getItem(app.storage.cacheVersion);
      
      // Check if cache version matches
      if (cachedVersion !== app.cacheConfig.version) {
        console.log("🔄 Cache version mismatch, clearing old cache");
        clearCache();
        return null;
      }

      const cached = localStorage.getItem(app.storage.cache);
      if (!cached) return null;

      const cacheData = JSON.parse(cached);
      
      // Check if cache is expired
      const cacheAge = Date.now() - cacheData.timestamp;
      const maxAge = app.cacheConfig.expiryDays * 24 * 60 * 60 * 1000;
      
      if (cacheAge > maxAge) {
        console.log("⏰ Cache expired, fetching fresh data");
        clearCache();
        return null;
      }

      return cacheData.data;
    } catch (error) {
      console.warn("Failed to load from cache:", error);
      clearCache();
      return null;
    }
  }

  function clearCache() {
    localStorage.removeItem(app.storage.cache);
    localStorage.removeItem(app.storage.cacheVersion);
    console.log("🗑️ Cache cleared");
  }


  function bindShell() {
    const savedTheme = localStorage.getItem(app.storage.theme);
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const shouldDark = savedTheme ? savedTheme === "dark" : prefersDark;
    document.documentElement.classList.toggle("dark", shouldDark);
    updateThemeIcons();

    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const isDark = !document.documentElement.classList.contains("dark");
        document.documentElement.classList.toggle("dark", isDark);
        localStorage.setItem(app.storage.theme, isDark ? "dark" : "light");
        updateThemeIcons();
        if (app.page === "dashboard") renderDashboardCharts();
        showToast(isDark ? "Dark mode enabled" : "Light mode enabled", "info");
      });
    });

    // Hamburger nav toggle with animation
    const navToggle = document.querySelector("[data-nav-toggle]");
    const navMenu = document.querySelector("[data-nav-menu]");
    navToggle?.addEventListener("click", () => {
      const isOpen = navMenu?.classList.toggle("open");
      navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
      navToggle.innerHTML = isOpen
        ? `<i class="fa-solid fa-xmark" aria-hidden="true"></i>`
        : `<i class="fa-solid fa-bars" aria-hidden="true"></i>`;
    });

    // Close nav on click outside
    document.addEventListener("click", (event) => {
      if (navMenu?.classList.contains("open") &&
          !navMenu.contains(event.target) &&
          !navToggle?.contains(event.target)) {
        navMenu.classList.remove("open");
        navToggle?.setAttribute("aria-expanded", "false");
        if (navToggle) navToggle.innerHTML = `<i class="fa-solid fa-bars" aria-hidden="true"></i>`;
      }
    });

    // Close nav on nav item click (mobile)
    navMenu?.querySelectorAll(".nav-item").forEach((item) => {
      item.addEventListener("click", () => {
        if (window.innerWidth < 768) {
          navMenu.classList.remove("open");
          navToggle?.setAttribute("aria-expanded", "false");
          if (navToggle) navToggle.innerHTML = `<i class="fa-solid fa-bars" aria-hidden="true"></i>`;
        }
      });
    });

    document.getElementById("companyModal")?.addEventListener("click", (event) => {
      if (event.target.closest("[data-close-modal]")) closeModal();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        closeModal();
        closeFilterDrawer();
        if (navMenu?.classList.contains("open")) {
          navMenu.classList.remove("open");
          navToggle?.setAttribute("aria-expanded", "false");
          if (navToggle) navToggle.innerHTML = `<i class="fa-solid fa-bars" aria-hidden="true"></i>`;
        }
      }
    });

    // Mobile filter drawer bindings (companies page)
    setupFilterDrawer();
  }

  function setupBackToTop() {
    const btn = byId("backToTop");
    if (!btn) return;
    window.addEventListener("scroll", () => {
      btn.classList.toggle("visible", window.scrollY > 400);
    }, { passive: true });
    btn.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
  }

  /* ── Toast Notification System ── */
  function showToast(message, type = "info") {
    const container = byId("toastContainer");
    if (!container) return;
    const icons = {
      success: "fa-circle-check",
      error:   "fa-circle-xmark",
      warning: "fa-triangle-exclamation",
      info:    "fa-circle-info",
    };
    const toast = document.createElement("div");
    toast.className = `toast ${type}`;
    toast.setAttribute("role", "alert");
    toast.innerHTML = `
      <i class="toast-icon fa-solid ${icons[type] || icons.info}" aria-hidden="true"></i>
      <span class="toast-msg">${escapeHtml(message)}</span>
      <button class="toast-close" type="button" aria-label="Dismiss notification">
        <i class="fa-solid fa-xmark" aria-hidden="true"></i>
      </button>
    `;
    toast.querySelector(".toast-close").addEventListener("click", () => dismissToast(toast));
    container.appendChild(toast);
    setTimeout(() => dismissToast(toast), 3500);
  }

  function dismissToast(toast) {
    if (!toast.parentNode) return;
    toast.classList.add("removing");
    toast.addEventListener("animationend", () => toast.remove(), { once: true });
    setTimeout(() => toast.remove(), 400);
  }

  /* ── Mobile Filter Drawer ── */
  function setupFilterDrawer() {
    const fab = byId("filterFab");
    const overlay = byId("filterDrawerOverlay");
    const drawer = byId("mobileFilterDrawer");
    const closeBtn = byId("filterDrawerClose");
    const applyBtn = byId("applyDrawerFilters");
    const drawerReset = byId("drawerResetFilters");
    if (!fab || !drawer) return;

    fab.addEventListener("click", openFilterDrawer);
    overlay?.addEventListener("click", closeFilterDrawer);
    closeBtn?.addEventListener("click", closeFilterDrawer);

    applyBtn?.addEventListener("click", () => {
      syncDrawerToMain();
      closeFilterDrawer();
      app.directory.page = 1;
      applyDirectoryFilters();
    });

    drawerReset?.addEventListener("click", () => {
      resetDirectoryFilters();
      syncMainToDrawer();
      closeFilterDrawer();
    });

    // Drawer field inputs — sync realtime for instant feel
    const drawerFields = ["drawerCompanySearch", "drawerCityFilter", "drawerStateFilter",
      "drawerDomainFilter", "drawerInternshipFilter", "drawerCategoryFilter", "drawerRatingFilter"];
    drawerFields.forEach(id => {
      byId(id)?.addEventListener("change", () => {});
    });
  }

  function openFilterDrawer() {
    const fab = byId("filterFab");
    const overlay = byId("filterDrawerOverlay");
    const drawer = byId("mobileFilterDrawer");
    if (!drawer) return;
    syncMainToDrawer();
    overlay?.classList.add("open");
    drawer.classList.add("open");
    overlay?.removeAttribute("aria-hidden");
    drawer.removeAttribute("aria-hidden");
    fab?.setAttribute("aria-expanded", "true");
    document.body.style.overflow = "hidden";
  }

  function closeFilterDrawer() {
    const fab = byId("filterFab");
    const overlay = byId("filterDrawerOverlay");
    const drawer = byId("mobileFilterDrawer");
    if (!drawer) return;
    overlay?.classList.remove("open");
    drawer.classList.remove("open");
    overlay?.setAttribute("aria-hidden", "true");
    drawer.setAttribute("aria-hidden", "true");
    fab?.setAttribute("aria-expanded", "false");
    document.body.style.overflow = "";
  }

  function syncMainToDrawer() {
    const pairs = [
      ["companySearch", "drawerCompanySearch"],
      ["cityFilter", "drawerCityFilter"],
      ["stateFilter", "drawerStateFilter"],
      ["domainFilter", "drawerDomainFilter"],
      ["internshipFilter", "drawerInternshipFilter"],
      ["categoryFilter", "drawerCategoryFilter"],
      ["ratingFilter", "drawerRatingFilter"],
    ];
    pairs.forEach(([mainId, drawerId]) => {
      const mainEl = byId(mainId);
      const drawerEl = byId(drawerId);
      if (mainEl && drawerEl) drawerEl.value = mainEl.value;
    });
  }

  function syncDrawerToMain() {
    const pairs = [
      ["companySearch", "drawerCompanySearch"],
      ["cityFilter", "drawerCityFilter"],
      ["stateFilter", "drawerStateFilter"],
      ["domainFilter", "drawerDomainFilter"],
      ["internshipFilter", "drawerInternshipFilter"],
      ["categoryFilter", "drawerCategoryFilter"],
      ["ratingFilter", "drawerRatingFilter"],
    ];
    pairs.forEach(([mainId, drawerId]) => {
      const mainEl = byId(mainId);
      const drawerEl = byId(drawerId);
      if (mainEl && drawerEl) mainEl.value = drawerEl.value;
    });
  }

  function updateFilterBadge() {
    const countEl = byId("filterFabCount");
    if (!countEl) return;
    const activeCount = [
      valueOf("companySearch"), valueOf("cityFilter"), valueOf("stateFilter"),
      valueOf("domainFilter"), valueOf("internshipFilter"), valueOf("categoryFilter"), valueOf("ratingFilter")
    ].filter(Boolean).length;
    if (activeCount > 0) {
      countEl.textContent = activeCount;
      countEl.classList.remove("hidden");
    } else {
      countEl.classList.add("hidden");
    }
  }



  function updateThemeIcons() {
    const isDark = document.documentElement.classList.contains("dark");
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.innerHTML = `<i class="fa-solid ${isDark ? "fa-sun" : "fa-moon"}" aria-hidden="true"></i>`;
    });
  }

  function setupRevealAnimations() {
    const elements = document.querySelectorAll(".reveal");
    if (!("IntersectionObserver" in window)) {
      elements.forEach((element) => element.classList.add("is-visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.12 }
    );

    elements.forEach((element) => observer.observe(element));
  }

  function normalizeCompany(company) {
    const normalized = {
      id: clean(company.id) || `company-${Math.random().toString(36).slice(2)}`,
      srNo: Number(company.srNo) || "",
      companyName: clean(company.companyName || company["Startup / Company Name"] || company["Company Name"]),
      cityState: clean(company.cityState || company["City / State"]),
      city: clean(company.city),
      state: clean(company.state),
      location: clean(company.location || company.Location),
      address: clean(company.address || company.Address),
      website: cleanUrl(company.website || company.Website),
      hrEmail: clean(company.hrEmail || company["HR Email"] || company.Email),
      phoneNumber: clean(company.phoneNumber || company["Phone Number"] || company["Mobile Number"]),
      linkedIn: cleanUrl(company.linkedIn || company.LinkedIn),
      internshipAvailable: clean(company.internshipAvailable || company["Internship Available"] || company["Provides Internship"]) || "Not Found",
      internshipType: clean(company.internshipType || company["Internship Type"]) || "Internship / Training",
      domain: clean(company.domain || company.Domain) || "General IT",
      careersPage: cleanUrl(company.careersPage || company["Careers Page"] || company["Current Job Openings"]),
      category: clean(company.category || company.Category) || "Company",
      rating: Number(company.rating || company.Rating) || null,
      reviews: Number(company.reviews || company.Reviews) || 0,
      googleMapsLink: cleanUrl(company.googleMapsLink || company["Google Maps Link"]),
    };

    if (!normalized.city && normalized.cityState) normalized.city = normalized.cityState.split(",")[0].trim();
    if (!normalized.state && normalized.cityState.includes(",")) normalized.state = normalized.cityState.split(",").slice(1).join(",").trim();

    normalized.searchIndex = [
      normalized.companyName,
      normalized.city,
      normalized.state,
      normalized.cityState,
      normalized.domain,
      normalized.category,
      normalized.address,
      normalized.location,
      normalized.website,
    ]
      .join(" ")
      .toLowerCase();

    return normalized;
  }

  function routePage() {
    if (app.page === "home") renderHome();
    if (app.page === "companies") renderCompaniesPage();
    if (app.page === "dashboard") renderDashboard();
  }

  function renderHome() {
    const stats = getStats(app.companies);
    setText("heroTotalCompanies", formatNumber(stats.total));
    setText("heroInternships", formatNumber(stats.internships));
    setText("heroContactReady", formatNumber(stats.contactReady));
    animateCounter("statCompanies", stats.total);
    animateCounter("statStartups", stats.startups);
    animateCounter("statInternshipProviders", stats.internships);
    animateCounter("statContactReady", stats.contactReady);

    const featured = topCompanies(app.companies.filter((company) => company.internshipAvailable === "Yes"), 6);
    setHtml("featuredCompanies", featured.map((company) => renderCompanyCard(company, { compact: true })).join(""));
    setHtml("heroPreviewList", featured.slice(0, 4).map(renderVisualCompany).join(""));

    const topCitiesData = topCounts(app.companies, "city", 10);
    const topDomainsData = topCounts(app.companies, "domain", 12);
    setHtml("topCities", renderCountChips(topCitiesData.labels.map((label, i) => [label, topCitiesData.values[i]]), "companies.html?city="));
    setHtml("topDomains", renderCountChips(topDomainsData.labels.map((label, i) => [label, topDomainsData.values[i]]), "companies.html?domain="));
    renderCompactList("homeRecentlyViewed", getRecentCompanies().slice(0, 6), "No recently viewed companies yet.");

    bindHeroSearch();
    bindCardInteractions(document);
  }

  function bindHeroSearch() {
    const form = document.getElementById("heroSearchForm");
    const input = document.getElementById("heroSearch");
    const suggestions = document.getElementById("heroSuggestions");
    if (!form || !input || !suggestions) return;

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const query = input.value.trim();
      if (query) sessionStorage.setItem("directory-query", query);
      window.location.href = `companies.html${query ? `?q=${encodeURIComponent(query)}` : ""}`;
    });

    input.addEventListener("input", () => renderSuggestions(input, suggestions, selectCompanySuggestion));
    input.addEventListener("focus", () => renderSuggestions(input, suggestions, selectCompanySuggestion));
    document.addEventListener("click", (event) => {
      if (!suggestions.contains(event.target) && event.target !== input) suggestions.classList.add("hidden");
    });

    function selectCompanySuggestion(company) {
      input.value = company.companyName;
      suggestions.classList.add("hidden");
      sessionStorage.setItem("directory-query", company.companyName);
      window.location.href = `companies.html?q=${encodeURIComponent(company.companyName)}`;
    }
  }

  function renderCompaniesPage() {
    const params = new URLSearchParams(window.location.search);
    const queryFromUrl = params.get("q") || sessionStorage.getItem("directory-query") || "";
    sessionStorage.removeItem("directory-query");

    const stats = getStats(app.companies);
    setText("directoryTotal", formatNumber(stats.total));
    setText("directoryInternships", formatNumber(stats.internships));
    setText("directoryContactReady", formatNumber(stats.contactReady));

    fillSelect("cityFilter", "All cities", uniqueValues("city"));
    fillSelect("stateFilter", "All states", uniqueValues("state"));
    fillSelect("domainFilter", "All domains", uniqueValues("domain"));
    fillSelect("categoryFilter", "All categories", uniqueValues("category"));

    const globalSearch = byId("globalSearch");
    if (globalSearch) globalSearch.value = queryFromUrl;
    if (params.get("city")) setValue("cityFilter", params.get("city"));
    if (params.get("domain")) setValue("domainFilter", params.get("domain"));

    app.directory.view = params.get("view") || "all";
    setActiveView(app.directory.view);
    bindDirectoryControls();
    applyDirectoryFilters();
  }

  function bindDirectoryControls() {
    const controls = ["globalSearch", "companySearch", "cityFilter", "stateFilter", "domainFilter", "internshipFilter", "categoryFilter", "ratingFilter"];
    controls.forEach((id) => {
      byId(id)?.addEventListener("input", () => {
        app.directory.page = 1;
        applyDirectoryFilters();
      });
      byId(id)?.addEventListener("change", () => {
        app.directory.page = 1;
        applyDirectoryFilters();
      });
    });

    const suggestionBox = byId("directorySuggestions");
    const globalSearch = byId("globalSearch");
    globalSearch?.addEventListener("input", () => renderSuggestions(globalSearch, suggestionBox, (company) => {
      globalSearch.value = company.companyName;
      suggestionBox.classList.add("hidden");
      app.directory.page = 1;
      applyDirectoryFilters();
    }));
    globalSearch?.addEventListener("focus", () => renderSuggestions(globalSearch, suggestionBox, (company) => {
      globalSearch.value = company.companyName;
      suggestionBox.classList.add("hidden");
      app.directory.page = 1;
      applyDirectoryFilters();
    }));
    document.addEventListener("click", (event) => {
      if (suggestionBox && !suggestionBox.contains(event.target) && event.target !== globalSearch) suggestionBox.classList.add("hidden");
    });

    byId("sortSelect")?.addEventListener("change", (event) => {
      app.directory.sort = event.target.value;
      app.directory.page = 1;
      applyDirectoryFilters();
    });

    byId("pageSize")?.addEventListener("change", (event) => {
      app.directory.pageSize = Number(event.target.value) || 12;
      app.directory.page = 1;
      applyDirectoryFilters();
    });

    document.querySelectorAll("[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        app.directory.view = button.dataset.view;
        app.directory.page = 1;
        setActiveView(app.directory.view);
        applyDirectoryFilters();
      });
    });

    byId("resetFilters")?.addEventListener("click", resetDirectoryFilters);
    byId("exportCsv")?.addEventListener("click", () => downloadCsv(app.companies, "india-it-companies.csv"));
    byId("exportExcel")?.addEventListener("click", () => downloadExcel(app.companies, "india-it-companies.xls"));
    byId("exportFiltered")?.addEventListener("click", () => downloadCsv(app.filtered, "filtered-it-companies.csv"));

    byId("pagination")?.addEventListener("click", (event) => {
      const button = event.target.closest("[data-page-action]");
      if (!button || button.disabled) return;
      if (button.dataset.pageAction === "prev") app.directory.page -= 1;
      if (button.dataset.pageAction === "next") app.directory.page += 1;
      if (button.dataset.pageAction === "first") app.directory.page = 1;
      applyDirectoryFilters({ keepScroll: false });
      byId("companyGrid")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    bindCardInteractions(document);
    setupInfiniteScroll();
  }

  function applyDirectoryFilters(options = {}) {
    const query = valueOf("globalSearch").toLowerCase();
    const companyQuery = valueOf("companySearch").toLowerCase();
    const city = valueOf("cityFilter");
    const state = valueOf("stateFilter");
    const domain = valueOf("domainFilter");
    const internship = valueOf("internshipFilter");
    const category = valueOf("categoryFilter");
    const minRating = Number(valueOf("ratingFilter")) || 0;
    const bookmarkIds = new Set(getBookmarks());
    const recentIds = new Set(getRecentIds());

    let records = app.companies.filter((company) => {
      if (app.directory.view === "internships" && company.internshipAvailable !== "Yes") return false;
      if (app.directory.view === "contact" && !isContactReady(company)) return false;
      if (app.directory.view === "bookmarks" && !bookmarkIds.has(company.id)) return false;
      if (app.directory.view === "recent" && !recentIds.has(company.id)) return false;
      if (query && !company.searchIndex.includes(query)) return false;
      if (companyQuery && !company.companyName.toLowerCase().includes(companyQuery)) return false;
      if (city && company.city !== city) return false;
      if (state && company.state !== state) return false;
      if (domain && company.domain !== domain) return false;
      if (internship && company.internshipAvailable !== internship) return false;
      if (category && company.category !== category) return false;
      if (minRating && (!company.rating || company.rating < minRating)) return false;
      return true;
    });

    records = sortCompanies(records, query);
    app.filtered = records;
    const maxPage = Math.max(1, Math.ceil(records.length / app.directory.pageSize));
    app.directory.page = Math.min(Math.max(app.directory.page, 1), maxPage);

    renderDirectoryResults();
    renderActiveFilters();
    renderDirectoryPagination();

    if (!options.keepScroll) {
      setTimeout(() => byId("directoryMain")?.scrollIntoView?.({ behavior: "smooth", block: "start" }), 0);
    }
  }

  function renderDirectoryResults() {
    const visibleCount = Math.min(app.filtered.length, app.directory.page * app.directory.pageSize);
    const visible = app.filtered.slice(0, visibleCount);
    setText("resultCount", formatNumber(app.filtered.length));
    byId("emptyState")?.classList.toggle("hidden", visible.length > 0);
    setHtml("companyGrid", visible.map((company) => renderCompanyCard(company)).join(""));
  }

  function renderActiveFilters() {
    const chips = [];
    const labels = {
      all: "All",
      internships: "Internship Hub",
      contact: "Contact Ready",
      bookmarks: "Bookmarks",
      recent: "Recent",
    };
    if (app.directory.view !== "all") chips.push(["View", labels[app.directory.view]]);
    [
      ["Search", valueOf("globalSearch")],
      ["Company", valueOf("companySearch")],
      ["City", valueOf("cityFilter")],
      ["State", valueOf("stateFilter")],
      ["Domain", valueOf("domainFilter")],
      ["Internship", valueOf("internshipFilter")],
      ["Category", valueOf("categoryFilter")],
      ["Rating", valueOf("ratingFilter") ? `${valueOf("ratingFilter")}+` : ""],
    ].forEach(([label, value]) => {
      if (value) chips.push([label, value]);
    });
    setHtml("activeFilters", chips.map(([label, value]) => `<span class="filter-chip"><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</span>`).join(""));
    updateFilterBadge();
  }

  function renderDirectoryPagination() {
    const maxPage = Math.max(1, Math.ceil(app.filtered.length / app.directory.pageSize));
    const showing = Math.min(app.filtered.length, app.directory.page * app.directory.pageSize);
    const html = `
      <button class="page-button" type="button" data-page-action="first" ${app.directory.page === 1 ? "disabled" : ""}>First</button>
      <button class="page-button" type="button" data-page-action="prev" ${app.directory.page === 1 ? "disabled" : ""}><i class="fa-solid fa-chevron-left"></i></button>
      <span class="page-button active">${formatNumber(showing)} / ${formatNumber(app.filtered.length)}</span>
      <button class="page-button" type="button" data-page-action="next" ${app.directory.page >= maxPage ? "disabled" : ""}>Load More <i class="fa-solid fa-chevron-right"></i></button>
    `;
    setHtml("pagination", app.filtered.length ? html : "");
  }

  function setupInfiniteScroll() {
    const sentinel = byId("scrollSentinel");
    if (!sentinel || !("IntersectionObserver" in window)) return;
    app.directory.observer?.disconnect();
    app.directory.observer = new IntersectionObserver(
      (entries) => {
        const maxPage = Math.max(1, Math.ceil(app.filtered.length / app.directory.pageSize));
        if (entries[0]?.isIntersecting && app.directory.page < maxPage) {
          app.directory.page += 1;
          renderDirectoryResults();
          renderDirectoryPagination();
        }
      },
      { rootMargin: "500px 0px" }
    );
    app.directory.observer.observe(sentinel);
  }

  function resetDirectoryFilters() {
    ["globalSearch", "companySearch", "cityFilter", "stateFilter", "domainFilter", "internshipFilter", "categoryFilter", "ratingFilter"].forEach((id) => setValue(id, ""));
    setValue("sortSelect", "relevance");
    app.directory.sort = "relevance";
    app.directory.view = "all";
    app.directory.page = 1;
    setActiveView("all");
    applyDirectoryFilters();
  }

  function setActiveView(view) {
    document.querySelectorAll("[data-view]").forEach((button) => {
      button.classList.toggle("active", button.dataset.view === view);
    });
  }

  function renderDashboard() {
    const stats = getStats(app.companies);
    setText("dashboardCompanies", formatNumber(stats.total));
    setText("dashboardCities", formatNumber(stats.cities));
    setText("dashboardDomains", formatNumber(stats.domains));
    animateCounter("dashboardInternships", stats.internships);
    animateCounter("dashboardStartups", stats.startups);
    animateCounter("dashboardCompaniesOnly", stats.companies);
    animateCounter("dashboardContactReady", stats.contactReady);

    renderDashboardCharts();
    
    // Get internship providers with ratings
    const internshipProviders = app.companies.filter((company) => company.internshipAvailable === "Yes");
    const topInternshipProviders = topCompanies(internshipProviders, 8);
    console.log("Internship providers:", topInternshipProviders.length);
    renderCompactList("dashboardInternshipList", topInternshipProviders, "No internship providers found.");
    
    // Get contact ready companies
    const contactReadyCompanies = app.companies.filter(isContactReady);
    const topContactReady = topCompanies(contactReadyCompanies, 8);
    console.log("Contact ready companies:", topContactReady.length);
    renderCompactList("dashboardContactList", topContactReady, "No contact ready companies found.");
    
    bindCardInteractions(document);
  }

  function renderDashboardCharts() {
    if (!window.Chart || app.page !== "dashboard" || !app.companies.length) {
      console.warn("Charts cannot be rendered:", {
        hasChart: !!window.Chart,
        page: app.page,
        companiesCount: app.companies.length
      });
      return;
    }
    const textColor = cssVar("--muted");
    const gridColor = cssVar("--border");
    const palette = [cssVar("--primary"), cssVar("--secondary"), cssVar("--accent"), cssVar("--success"), cssVar("--warning"), "#64748b"];
    const baseOptions = {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 900, easing: "easeOutQuart" },
      plugins: {
        legend: { 
          display: true,
          position: 'bottom',
          labels: { 
            color: textColor, 
            boxWidth: 12, 
            font: { weight: "bold" },
            padding: 10
          } 
        },
        tooltip: { 
          intersect: false, 
          mode: "nearest",
          callbacks: {
            label: function(context) {
              return context.label + ': ' + context.parsed.toFixed(1);
            }
          }
        },
      },
      scales: {
        x: { ticks: { color: textColor, font: { weight: "bold" } }, grid: { color: gridColor } },
        y: { beginAtZero: true, ticks: { color: textColor, font: { weight: "bold" } }, grid: { color: gridColor } },
      },
    };

    makeChart("cityChart", "bar", topCounts(app.companies, "city", 10), [palette[0]], baseOptions);
    makeChart("stateChart", "bar", topCounts(app.companies, "state", 10), [palette[1]], baseOptions);
    makeChart("domainChart", "bar", topCounts(app.companies, "domain", 10), [palette[2]], baseOptions);
    makeChart("internshipChart", "doughnut", topCounts(app.companies, "internshipAvailable", 5), palette, doughnutOptions(baseOptions));
    makeChart("categoryChart", "doughnut", topCounts(app.companies, "category", 6), palette, doughnutOptions(baseOptions));
    
    // Top rated as doughnut chart showing rating distribution
    const topRatedCompanies = topCompanies(app.companies.filter((company) => company.rating), 8);
    makeChart(
      "topRatedChart",
      "doughnut",
      {
        labels: topRatedCompanies.map((company) => truncate(company.companyName, 18)),
        values: topRatedCompanies.map((company) => company.rating),
      },
      palette,
      doughnutOptions(baseOptions)
    );
  }

  function makeChart(id, type, payload, colors, options) {
    const canvas = byId(id);
    if (!canvas) {
      console.warn(`Canvas not found: ${id}`);
      return;
    }
    
    // Destroy existing chart
    app.charts[id]?.destroy();
    
    // Check if we have data
    if (!payload.labels || !payload.values || payload.labels.length === 0) {
      console.warn(`No data for chart: ${id}`);
      return;
    }
    
    // Set fixed dimensions
    canvas.style.height = '320px';
    canvas.style.maxHeight = '320px';
    
    app.charts[id] = new Chart(canvas, {
      type,
      data: {
        labels: payload.labels,
        datasets: [
          {
            label: "Companies",
            data: payload.values,
            backgroundColor: type === "doughnut" ? colors : colors[0],
            borderColor: type === "doughnut" ? "transparent" : colors[0],
            borderWidth: 1,
            borderRadius: type === "bar" ? 8 : 0,
          },
        ],
      },
      options: {
        ...options,
        maintainAspectRatio: false,
        responsive: true,
      },
    });
  }

  function doughnutOptions(options) {
    return {
      ...options,
      cutout: "64%",
      scales: undefined,
    };
  }

  function bindCardInteractions(root) {
    root.addEventListener("click", (event) => {
      const detailsButton = event.target.closest("[data-details-id]");
      if (detailsButton) {
        const company = findCompany(detailsButton.dataset.detailsId);
        if (company) {
          addRecent(company.id);
          openModal(company);
        }
      }

      const bookmarkButton = event.target.closest("[data-bookmark-id]");
      if (bookmarkButton) {
        toggleBookmark(bookmarkButton.dataset.bookmarkId);
        updateBookmarkButtons();
        if (app.page === "companies" && app.directory.view === "bookmarks") applyDirectoryFilters();
      }
    });
  }

  function renderCompanyCard(company, options = {}) {
    const bookmarked = getBookmarks().includes(company.id);
    const compactClass = options.compact ? " compact-card" : "";
    return `
      <article class="company-card${compactClass}">
        <div class="company-top">
          <div class="company-identity">
            <span class="logo-mark">${escapeHtml(initials(company.companyName))}</span>
            <div class="min-w-0">
              <h3 class="company-title">${escapeHtml(company.companyName)}</h3>
              <div class="company-meta">
                <span><i class="fa-solid fa-location-dot"></i> ${escapeHtml(company.city || "India")}</span>
                <span>${escapeHtml(company.category)}</span>
              </div>
            </div>
          </div>
          <button class="bookmark-button ${bookmarked ? "active" : ""}" type="button" data-bookmark-id="${escapeAttr(company.id)}" aria-label="Bookmark ${escapeAttr(company.companyName)}">
            <i class="${bookmarked ? "fa-solid" : "fa-regular"} fa-bookmark"></i>
          </button>
        </div>
        <div class="badge-row">
          <span class="domain-badge">${escapeHtml(company.domain)}</span>
          <span class="status-badge ${statusClass(company.internshipAvailable)}">${escapeHtml(company.internshipAvailable)}</span>
          <span class="rating-badge"><i class="fa-solid fa-star"></i> ${company.rating ? company.rating.toFixed(1) : "NA"}</span>
        </div>
        <p class="company-address">${escapeHtml(company.address || company.location || company.cityState || "Address not available")}</p>
        <div class="card-actions">
          ${actionLink(company.website, "Website", "fa-globe")}
          ${actionLink(company.hrEmail ? `mailto:${company.hrEmail}` : "", "Email", "fa-envelope")}
          ${actionLink(company.linkedIn, "LinkedIn", "fa-linkedin-in", true)}
          ${actionLink(company.googleMapsLink, "Maps", "fa-map-location-dot")}
        </div>
        <button class="primary-action view-details" type="button" data-details-id="${escapeAttr(company.id)}">
          <i class="fa-solid fa-up-right-from-square"></i>
          View Details
        </button>
      </article>
    `;
  }

  function renderVisualCompany(company) {
    return `
      <div class="visual-company">
        <span class="logo-mark">${escapeHtml(initials(company.companyName))}</span>
        <div class="min-w-0">
          <strong>${escapeHtml(company.companyName)}</strong>
          <span>${escapeHtml([company.city, company.domain].filter(Boolean).join(" - "))}</span>
        </div>
        <span class="status-badge ${statusClass(company.internshipAvailable)}">${escapeHtml(company.internshipAvailable)}</span>
      </div>
    `;
  }

  function actionLink(url, label, icon, brand = false) {
    if (!url) {
      const disabledIconClass = brand ? `fa-brands ${icon}` : `fa-solid ${icon}`;
      return `<span class="card-button disabled" title="${escapeAttr(label)} unavailable"><i class="${disabledIconClass}"></i><span>${escapeHtml(label)}</span></span>`;
    }
    const iconClass = brand ? `fa-brands ${icon}` : `fa-solid ${icon}`;
    return `<a class="card-button" href="${escapeAttr(url)}" target="_blank" rel="noopener" title="${escapeAttr(label)}"><i class="${iconClass}"></i><span>${escapeHtml(label)}</span></a>`;
  }

  function openModal(company) {
    const modal = byId("companyModal");
    const content = byId("modalContent");
    if (!modal || !content) return;
    content.innerHTML = `
      <button class="modal-close" type="button" data-close-modal aria-label="Close details"><i class="fa-solid fa-xmark"></i></button>
      <div class="modal-heading">
        <div>
          <span class="section-kicker">${escapeHtml(company.cityState || company.city || "India")}</span>
          <h2 id="modalTitle">${escapeHtml(company.companyName)}</h2>
          <div class="badge-row mt-4">
            <span class="domain-badge">${escapeHtml(company.domain)}</span>
            <span class="status-badge ${statusClass(company.internshipAvailable)}">${escapeHtml(company.internshipAvailable)}</span>
            <span class="rating-badge"><i class="fa-solid fa-star"></i> ${company.rating ? company.rating.toFixed(1) : "NA"} / ${formatNumber(company.reviews)} reviews</span>
          </div>
        </div>
      </div>
      <div class="modal-actions">
        ${actionLink(company.website, "Website", "fa-globe")}
        ${actionLink(company.hrEmail ? `mailto:${company.hrEmail}` : "", "Email", "fa-envelope")}
        ${actionLink(company.phoneNumber ? `tel:${company.phoneNumber.replace(/\s+/g, "")}` : "", "Call", "fa-phone")}
        ${actionLink(company.linkedIn, "LinkedIn", "fa-linkedin-in", true)}
        ${actionLink(company.careersPage, "Careers", "fa-briefcase")}
        ${actionLink(company.googleMapsLink, "Maps", "fa-map-location-dot")}
      </div>
      <div class="detail-grid">
        ${detailItem("Full Address", company.address, true)}
        ${detailItem("Website", linkedValue(company.website), false, true)}
        ${detailItem("Email", company.hrEmail)}
        ${detailItem("Phone Number", company.phoneNumber)}
        ${detailItem("LinkedIn", linkedValue(company.linkedIn), false, true)}
        ${detailItem("Internship Availability", company.internshipAvailable)}
        ${detailItem("Internship Type", company.internshipType)}
        ${detailItem("Careers Page", linkedValue(company.careersPage), false, true)}
        ${detailItem("Maps Link", linkedValue(company.googleMapsLink), true, true)}
      </div>
    `;
    modal.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closeModal() {
    byId("companyModal")?.classList.add("hidden");
    document.body.style.overflow = "";
  }

  function detailItem(label, value, full = false, raw = false) {
    const safeValue = raw ? value : escapeHtml(value);
    return `
      <div class="detail-item ${full ? "full" : ""}">
        <span>${escapeHtml(label)}</span>
        <strong>${safeValue || "Not available"}</strong>
      </div>
    `;
  }

  function linkedValue(url) {
    if (!url) return "";
    return `<a href="${escapeAttr(url)}" target="_blank" rel="noopener">${escapeHtml(url)}</a>`;
  }

  function renderSuggestions(input, panel, onPick) {
    if (!input || !panel) return;
    const query = input.value.trim().toLowerCase();
    if (query.length < 2) {
      panel.classList.add("hidden");
      panel.innerHTML = "";
      return;
    }

    const matches = app.companies
      .filter((company) => company.searchIndex.includes(query))
      .sort((a, b) => relevance(b, query) - relevance(a, query))
      .slice(0, 8);

    if (!matches.length) {
      panel.classList.add("hidden");
      panel.innerHTML = "";
      return;
    }

    panel.innerHTML = matches
      .map(
        (company) => `
          <button class="suggestion-option" type="button" data-suggestion-id="${escapeAttr(company.id)}">
            <span>
              <strong>${escapeHtml(company.companyName)}</strong>
              <span>${escapeHtml([company.city, company.domain].filter(Boolean).join(" - "))}</span>
            </span>
            <span class="status-badge ${statusClass(company.internshipAvailable)}">${escapeHtml(company.internshipAvailable)}</span>
          </button>
        `
      )
      .join("");
    panel.classList.remove("hidden");
    panel.querySelectorAll("[data-suggestion-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const company = findCompany(button.dataset.suggestionId);
        if (company) onPick(company);
      });
    });
  }

  function renderCompactList(id, companies, fallback) {
    const html = companies.length
      ? companies.map(renderCompactItem).join("")
      : `<div class="compact-item"><span class="logo-mark"><i class="fa-solid fa-circle-info"></i></span><div><strong>${escapeHtml(fallback || "No companies found.")}</strong><span>Explore the directory to populate this list.</span></div></div>`;
    setHtml(id, html);
  }

  function renderCompactItem(company) {
    return `
      <button class="compact-item" type="button" data-details-id="${escapeAttr(company.id)}">
        <span class="logo-mark">${escapeHtml(initials(company.companyName))}</span>
        <div class="compact-info">
          <strong>${escapeHtml(company.companyName)}</strong>
          <span>${escapeHtml([company.city, company.domain].filter(Boolean).join(" • "))}</span>
        </div>
        <span class="rating-badge"><i class="fa-solid fa-star"></i>${company.rating ? company.rating.toFixed(1) : "NA"}</span>
      </button>
    `;
  }

  function renderCountChips(rows, baseHref) {
    return rows
      .map(
        ([label, count]) => `
          <a class="data-chip" href="${baseHref}${encodeURIComponent(label)}">
            ${escapeHtml(label)}
            <span>${formatNumber(count)}</span>
          </a>
        `
      )
      .join("");
  }

  function getStats(records) {
    return {
      total: records.length,
      startups: records.filter((company) => company.category.toLowerCase() === "startup").length,
      companies: records.filter((company) => company.category.toLowerCase() !== "startup").length,
      internships: records.filter((company) => company.internshipAvailable === "Yes").length,
      contactReady: records.filter(isContactReady).length,
      cities: uniqueValues("city").length,
      domains: uniqueValues("domain").length,
    };
  }

  function sortCompanies(records, query = "") {
    const sorted = [...records];
    if (app.directory.sort === "nameAsc") return sorted.sort((a, b) => a.companyName.localeCompare(b.companyName));
    if (app.directory.sort === "cityAsc") return sorted.sort((a, b) => a.city.localeCompare(b.city) || a.companyName.localeCompare(b.companyName));
    if (app.directory.sort === "ratingDesc") return sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0));
    if (app.directory.sort === "internshipFirst") return sorted.sort((a, b) => Number(b.internshipAvailable === "Yes") - Number(a.internshipAvailable === "Yes") || (b.rating || 0) - (a.rating || 0));
    return sorted.sort((a, b) => relevance(b, query) - relevance(a, query));
  }

  function relevance(company, query = "") {
    let score = 0;
    const name = company.companyName.toLowerCase();
    if (!query) score += 10;
    if (query && name === query) score += 120;
    if (query && name.startsWith(query)) score += 80;
    if (query && name.includes(query)) score += 50;
    if (company.internshipAvailable === "Yes") score += 12;
    if (isContactReady(company)) score += 10;
    score += company.rating || 0;
    score += Math.min(company.reviews || 0, 1000) / 1000;
    return score;
  }

  function topCompanies(records, limit) {
    return [...records]
      .sort((a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviews || 0) - (a.reviews || 0) || a.companyName.localeCompare(b.companyName))
      .slice(0, limit);
  }

  function topCounts(records, key, limit) {
    const map = new Map();
    records.forEach((company) => {
      const label = clean(company[key]) || "Unknown";
      map.set(label, (map.get(label) || 0) + 1);
    });
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
    return {
      labels: sorted.map(([label]) => label),
      values: sorted.map(([, count]) => count)
    };
  }

  function uniqueValues(key) {
    return [...new Set(app.companies.map((company) => clean(company[key])).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  }

  function fillSelect(id, label, values) {
    const html = [`<option value="">${escapeHtml(label)}</option>`,
      ...values.map((value) => `<option value="${escapeAttr(value)}">${escapeHtml(value)}</option>`)].join("");
    setHtml(id, html);
    // Also populate drawer counterpart if it exists
    const drawerMap = {
      cityFilter: "drawerCityFilter",
      stateFilter: "drawerStateFilter",
      domainFilter: "drawerDomainFilter",
      categoryFilter: "drawerCategoryFilter",
    };
    const drawerId = drawerMap[id];
    if (drawerId) setHtml(drawerId, html);
  }

  function isContactReady(company) {
    return company.internshipAvailable === "Yes" && Boolean(company.website && company.hrEmail && company.phoneNumber);
  }

  function statusClass(status) {
    const lower = clean(status).toLowerCase();
    if (lower === "yes") return "status-yes";
    if (lower === "likely") return "status-likely";
    if (lower === "no") return "status-no";
    return "";
  }

  function getBookmarks() {
    return readStorageArray(app.storage.bookmarks);
  }

  function toggleBookmark(id) {
    const bookmarks = new Set(getBookmarks());
    const wasBookmarked = bookmarks.has(id);
    if (wasBookmarked) bookmarks.delete(id);
    else bookmarks.add(id);
    localStorage.setItem(app.storage.bookmarks, JSON.stringify([...bookmarks]));
    const company = findCompany(id);
    const name = company?.companyName || "Company";
    showToast(wasBookmarked ? `Removed "${name}" from bookmarks` : `Bookmarked "${name}"`, wasBookmarked ? "warning" : "success");
  }

  function updateBookmarkButtons() {
    const bookmarks = new Set(getBookmarks());
    document.querySelectorAll("[data-bookmark-id]").forEach((button) => {
      const active = bookmarks.has(button.dataset.bookmarkId);
      button.classList.toggle("active", active);
      button.innerHTML = `<i class="${active ? "fa-solid" : "fa-regular"} fa-bookmark"></i>`;
    });
  }

  function addRecent(id) {
    const recent = getRecentIds().filter((item) => item !== id);
    recent.unshift(id);
    localStorage.setItem(app.storage.recent, JSON.stringify(recent.slice(0, 24)));
  }

  function getRecentIds() {
    return readStorageArray(app.storage.recent);
  }

  function getRecentCompanies() {
    return getRecentIds().map(findCompany).filter(Boolean);
  }

  function readStorageArray(key) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function downloadCsv(records, filename) {
    const csv = toCsv(records);
    downloadBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), filename);
  }

  function downloadExcel(records, filename) {
    const xml = toExcelXml(records);
    downloadBlob(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" }), filename);
  }

  function toCsv(records) {
    const rows = records.map(exportRow);
    const headers = Object.keys(rows[0] || exportRow({}));
    return [headers, ...rows.map((row) => headers.map((header) => row[header]))].map((row) => row.map(csvCell).join(",")).join("\n");
  }

  function toExcelXml(records) {
    const rows = records.map(exportRow);
    const headers = Object.keys(rows[0] || exportRow({}));
    const table = [
      `<Row>${headers.map((header) => excelCell(header, true)).join("")}</Row>`,
      ...rows.map((row) => `<Row>${headers.map((header) => excelCell(row[header], false)).join("")}</Row>`),
    ].join("");
    return `<?xml version="1.0" encoding="UTF-8"?>
<?mso-application progid="Excel.Sheet"?>
<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"
  xmlns:o="urn:schemas-microsoft-com:office:office"
  xmlns:x="urn:schemas-microsoft-com:office:excel"
  xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">
  <Styles>
    <Style ss:ID="Header"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#2563EB" ss:Pattern="Solid"/></Style>
    <Style ss:ID="Text"><NumberFormat ss:Format="@"/></Style>
  </Styles>
  <Worksheet ss:Name="Companies"><Table>${table}</Table></Worksheet>
</Workbook>`;
  }

  function exportRow(company) {
    return {
      "SR No.": company.srNo || "",
      "Startup / Company Name": company.companyName || "",
      "City / State": company.cityState || "",
      City: company.city || "",
      State: company.state || "",
      Location: company.location || "",
      Address: company.address || "",
      Website: company.website || "",
      Email: company.hrEmail || "",
      "Phone Number": company.phoneNumber || "",
      LinkedIn: company.linkedIn || "",
      "Internship Available": company.internshipAvailable || "",
      "Internship Type": company.internshipType || "",
      Domain: company.domain || "",
      "Careers Page": company.careersPage || "",
      Category: company.category || "",
      Rating: company.rating || "",
      Reviews: company.reviews || "",
      "Google Maps Link": company.googleMapsLink || "",
    };
  }

  function csvCell(value) {
    const text = String(value ?? "");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
  }

  function excelCell(value, header) {
    return `<Cell ss:StyleID="${header ? "Header" : "Text"}"><Data ss:Type="String">${escapeXml(value)}</Data></Cell>`;
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  function renderLoadError(error) {
    const message = `<div class="empty-state"><i class="fa-solid fa-triangle-exclamation"></i><strong>Unable to load data</strong><span>${escapeHtml(error.message)}</span></div>`;
    ["featuredCompanies", "companyGrid", "dashboardInternshipList"].forEach((id) => setHtml(id, message));
  }

  function animateCounter(id, target) {
    const element = byId(id);
    if (!element) return;
    const duration = 850;
    const start = performance.now();
    const from = 0;
    const tick = (now) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      element.textContent = formatNumber(Math.round(from + (target - from) * eased));
      if (progress < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function findCompany(id) {
    return app.companies.find((company) => company.id === id);
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function setText(id, value) {
    const element = byId(id);
    if (element) element.textContent = value;
  }

  function setHtml(id, value) {
    const element = byId(id);
    if (element) element.innerHTML = value;
  }

  function valueOf(id) {
    return byId(id)?.value?.trim() || "";
  }

  function setValue(id, value) {
    const element = byId(id);
    if (element) element.value = value || "";
  }

  function clean(value) {
    return String(value || "").trim();
  }

  function cleanUrl(value) {
    const text = clean(value);
    if (!text) return "";
    if (/^https?:\/\//i.test(text) || /^mailto:/i.test(text) || /^tel:/i.test(text)) return text;
    if (/^www\./i.test(text)) return `https://${text}`;
    return text;
  }

  function initials(name) {
    return clean(name)
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "IT";
  }

  function formatNumber(value) {
    return new Intl.NumberFormat("en-IN").format(Number(value) || 0);
  }

  function truncate(value, max) {
    const text = clean(value);
    return text.length > max ? `${text.slice(0, max - 1)}...` : text;
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function escapeAttr(value) {
    return escapeHtml(value);
  }

  function escapeXml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&apos;");
  }
})();
