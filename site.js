/**
 * Kyiv 2027 - Cyber-Tactical Command System & Interactivity
 * Handles:
 * - HUD Mode Switching (Cyan, FLIR Night Vision, Amber CRT, Stealth)
 * - Live Radio Dispatch Ticker with simulated military voice feeds
 * - Mouse GPS & Grid Coordinate Telemetry Tracking
 * - Hero Carousel & Touch Gestures
 * - Weather & Atmospheric Particle Simulation
 * - Holographic Arsenal Blueprint Inspector
 * - Modal Gallery Lightbox & News Filters
 * - 3D Card Perspective Tilt
 */

document.addEventListener('DOMContentLoaded', () => {
  // --- 1. HUD Visual Mode Switcher (Cyan, FLIR, Amber, Stealth) ---
  const hudModeBtns = document.querySelectorAll('[data-hud]');
  hudModeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      hudModeBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.hud;
      document.body.dataset.hudMode = mode;

      // Notify radar simulator to adapt color theme
      if (window.kyivSim && typeof window.kyivSim.setTheme === 'function') {
        window.kyivSim.setTheme(mode);
      }
    });
  });

  // --- 2. Live Radio Dispatch Ticker Simulation ---
  const tickerText = document.getElementById('ticker-text');
  const dispatchFeeds = [
    "[ПІВНІЧ-01] Виявлено групу шахедів над Вишгородом. Курс 180°, висота 120м. МВГ приведені в готовність.",
    "[ЦЕНТР-ППО] МВГ-01 та МВГ-02 зайняли рубежі перехоплення вздовж русла Дніпра.",
    "[ГЕПАРД-ПОДІЛ] Ціль захоплено радаром супроводу. Сектор Північний міст під прикриттям.",
    "[ПАТРІОТ-03] Балістичний щит Києва активний. Радіус виявлення 160 км.",
    "[ТЕЦ-5 ВИДУБИЧІ] Енергетичний вузол під подвійним захистом мобільних груп. Напруга в нормі.",
    "[АКУСТИКА ЗВУК] Мережа сенсорів на дахах фіксує шум пропелера в квадраті Русанівка.",
    "[КИЇВ ОБОРОНА] Усі 10 районів столиці: чергування вогневих груп 100%."
  ];
  let dispatchIdx = 0;

  if (tickerText) {
    setInterval(() => {
      dispatchIdx = (dispatchIdx + 1) % dispatchFeeds.length;
      tickerText.style.opacity = '0';
      setTimeout(() => {
        tickerText.textContent = dispatchFeeds[dispatchIdx];
        tickerText.style.opacity = '1';
      }, 250);
    }, 6000);
  }

  // --- 3. Mouse GPS & Grid Coordinates Telemetry Tracking ---
  const coordsDisplay = document.getElementById('tactical-coords-display');
  if (coordsDisplay) {
    window.addEventListener('mousemove', (e) => {
      const lat = (50.4000 + (e.clientY / window.innerHeight) * 0.1000).toFixed(4);
      const lon = (30.4500 + (e.clientX / window.innerWidth) * 0.1500).toFixed(4);
      coordsDisplay.textContent = `LAT: ${lat}° N | LON: ${lon}° E | GRID: 044-KYIV`;
    }, { passive: true });
  }

  // --- 4. Fixed Topbar on Scroll ---
  const topbar = document.querySelector('.topbar');
  const toTopBtn = document.querySelector('.to-top');

  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    if (topbar) {
      topbar.classList.toggle('scrolled', scrollY > 24);
    }
    if (toTopBtn) {
      toTopBtn.classList.toggle('show', scrollY > window.innerHeight * 0.7);
    }
  }, { passive: true });

  if (toTopBtn) {
    toTopBtn.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }

  // --- 5. Mobile Drawer Navigation ---
  const burger = document.querySelector('.burger');
  const mnav = document.getElementById('mnav');

  function setMenu(open) {
    if (!burger || !mnav) return;
    burger.setAttribute('aria-expanded', String(open));
    mnav.hidden = !open;
    document.documentElement.classList.toggle('no-scroll', open);
    if (topbar) topbar.classList.toggle('menu-open', open);
  }

  if (burger && mnav) {
    burger.addEventListener('click', () => {
      const isOpen = burger.getAttribute('aria-expanded') === 'true';
      setMenu(!isOpen);
    });

    mnav.querySelectorAll('a').forEach(link => {
      link.addEventListener('click', () => setMenu(false));
    });

    window.addEventListener('resize', () => {
      if (window.innerWidth > 760 && burger.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
      }
    });

    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && burger.getAttribute('aria-expanded') === 'true') {
        setMenu(false);
      }
    });
  }

  // --- 6. Language Selector Popover ---
  const langDetails = document.querySelector('details.lang');
  if (langDetails) {
    document.addEventListener('click', (e) => {
      if (!langDetails.contains(e.target)) {
        langDetails.removeAttribute('open');
      }
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') langDetails.removeAttribute('open');
    });
  }

  // --- 7. Hero Carousel ---
  const hero = document.querySelector('.hero');
  const slides = document.querySelectorAll('.slide');
  const dotsContainer = document.querySelector('.sl-dots');
  const prevBtn = document.querySelector('.sl-prev');
  const nextBtn = document.querySelector('.sl-next');
  const playBtn = document.querySelector('.sl-play');
  const captionEl = document.querySelector('.slide-cap');

  if (slides.length > 0) {
    let currentSlide = 0;
    let timer = null;
    let isPlaying = true;
    const intervalMs = 6500;

    if (dotsContainer) {
      dotsContainer.innerHTML = '';
      slides.forEach((_, idx) => {
        const dot = document.createElement('button');
        dot.type = 'button';
        dot.setAttribute('aria-label', `Кадр ${idx + 1}`);
        if (idx === 0) dot.setAttribute('aria-current', 'true');
        dot.addEventListener('click', () => goToSlide(idx));
        dotsContainer.appendChild(dot);
      });
    }

    function updateSlideUI() {
      slides.forEach((s, idx) => {
        s.classList.toggle('is-active', idx === currentSlide);
      });

      const dots = dotsContainer ? dotsContainer.querySelectorAll('button') : [];
      dots.forEach((d, idx) => {
        if (idx === currentSlide) {
          d.setAttribute('aria-current', 'true');
        } else {
          d.removeAttribute('aria-current');
        }
      });

      if (captionEl && slides[currentSlide]) {
        const figcap = slides[currentSlide].querySelector('figcaption');
        captionEl.textContent = figcap ? figcap.textContent : '';
      }

      if (hero) {
        hero.classList.remove('sl-tick');
        void hero.offsetWidth;
        hero.classList.add('sl-tick');
      }
    }

    function goToSlide(idx) {
      currentSlide = (idx + slides.length) % slides.length;
      updateSlideUI();
      if (isPlaying) resetTimer();
    }

    function nextSlide() {
      goToSlide(currentSlide + 1);
    }

    function prevSlide() {
      goToSlide(currentSlide - 1);
    }

    function resetTimer() {
      clearInterval(timer);
      if (isPlaying) {
        timer = setInterval(nextSlide, intervalMs);
        if (hero) hero.classList.add('sl-running');
      }
    }

    if (nextBtn) nextBtn.addEventListener('click', nextSlide);
    if (prevBtn) prevBtn.addEventListener('click', prevSlide);

    if (playBtn) {
      playBtn.addEventListener('click', () => {
        isPlaying = !isPlaying;
        playBtn.classList.toggle('is-paused', !isPlaying);
        if (isPlaying) {
          resetTimer();
        } else {
          clearInterval(timer);
          if (hero) hero.classList.remove('sl-running');
        }
      });
    }

    // Touch gestures
    let touchStartX = 0;
    let touchStartY = 0;
    if (hero) {
      hero.addEventListener('touchstart', (e) => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
      }, { passive: true });

      hero.addEventListener('touchend', (e) => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;
        if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) {
          if (dx < 0) nextSlide();
          else prevSlide();
        }
      }, { passive: true });
    }

    updateSlideUI();
    resetTimer();
    if (hero) hero.classList.add('sl-ready');
  }

  // --- 8. Atmospheric Weather Particle Engine ---
  const weatherBtns = document.querySelectorAll('[data-weather]');
  const atmosphericCanvas = document.getElementById('weather-canvas');
  let activeWeather = 'night';
  let weatherParticles = [];

  if (atmosphericCanvas) {
    const ctx = atmosphericCanvas.getContext('2d');
    function resizeWeather() {
      atmosphericCanvas.width = window.innerWidth;
      atmosphericCanvas.height = window.innerHeight;
    }
    resizeWeather();
    window.addEventListener('resize', resizeWeather);

    function createWeatherParticles() {
      weatherParticles = [];
      const count = activeWeather === 'winter' ? 90 : activeWeather === 'rain' ? 140 : 30;
      for (let i = 0; i < count; i++) {
        weatherParticles.push({
          x: Math.random() * atmosphericCanvas.width,
          y: Math.random() * atmosphericCanvas.height,
          vx: activeWeather === 'winter' ? (Math.random() - 0.5) * 1.5 : (Math.random() - 0.3) * 2.2,
          vy: activeWeather === 'winter' ? Math.random() * 2 + 1 : Math.random() * 9 + 6,
          size: activeWeather === 'winter' ? Math.random() * 2.5 + 1 : 1.5,
          alpha: Math.random() * 0.6 + 0.2
        });
      }
    }

    function renderWeather() {
      ctx.clearRect(0, 0, atmosphericCanvas.width, atmosphericCanvas.height);

      for (const p of weatherParticles) {
        p.x += p.vx;
        p.y += p.vy;

        if (p.y > atmosphericCanvas.height) {
          p.y = -10;
          p.x = Math.random() * atmosphericCanvas.width;
        }
        if (p.x < 0) p.x = atmosphericCanvas.width;
        if (p.x > atmosphericCanvas.width) p.x = 0;

        if (activeWeather === 'rain') {
          ctx.strokeStyle = `rgba(160, 220, 255, ${p.alpha * 0.7})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x + p.vx * 2, p.y + p.vy * 2);
          ctx.stroke();
        } else {
          ctx.fillStyle = activeWeather === 'winter'
            ? `rgba(255, 255, 255, ${p.alpha})`
            : `rgba(0, 240, 255, ${p.alpha * 0.4})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      requestAnimationFrame(renderWeather);
    }

    createWeatherParticles();
    renderWeather();

    weatherBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        weatherBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        activeWeather = btn.dataset.weather;
        createWeatherParticles();
        document.body.dataset.themeWeather = activeWeather;
      });
    });
  }

  // --- 9. Holographic Arsenal Blueprint Viewer ---
  const arsenalCards = document.querySelectorAll('.weapon-blueprint-card');
  const blueprintDisplay = document.getElementById('blueprint-inspector');

  const arsenalData = {
    mvg: {
      title: 'Мобільна Вогнева Група (МВГ)',
      subtitle: 'Швидкісний пікап 4x4 • Спарений кулемет 12.7 мм / ДШК • Лазерний далекомір',
      role: 'Перехоплення ударних дронів «Шахед-136» на малих висотах, захист русла Дніпра та мостів.',
      range: '2 500 м',
      rate: '600 постр/хв',
      readiness: 'Миттєва (патрулювання)',
      mobility: '110 км/год пересування вулицями'
    },
    gepard: {
      title: 'Gepard 1A2 (ЗСУ «Гепард»)',
      subtitle: 'Дві 35-мм автоматичні гармати Oerlikon KDA • Радіолокаційний радар супроводу',
      role: 'Автоматичне наведення на низьколетючі крилаті ракети та дрони, висока щільність вогню снарядами AHEAD.',
      range: '4 000 м',
      rate: '1 100 постр/хв',
      readiness: 'Автономна станція',
      mobility: 'Гусеничне шасі Leopard 1'
    },
    patriot: {
      title: 'MIM-104 Patriot PAC-3',
      subtitle: 'Зенітно-ракетний комплекс великої дальності • Фазована антенна решітка AN/MPQ-65',
      role: 'Знищення балістичних ракет «Іскандер-М», «Кинджал» та надзвукових крилатих ракет на підступах до Києва.',
      range: '60 - 160 км',
      rate: 'Залп 4-16 ракет',
      readiness: 'Цілодобове чергування',
      mobility: 'Напівпричіп M860'
    },
    zvuk: {
      title: 'Акустична мережа «ЗВУК»',
      subtitle: 'Тисячі мікрофонних сенсорів штучного інтелекту на дахах будинків Києва',
      role: 'Раннє виявлення низьколетючих дронів у тумані та хмарах за шумом двигуна до появи на радарах.',
      range: 'Суцільне покриття міста',
      rate: 'Реальний час (0.2 с затримки)',
      readiness: '100% активна',
      mobility: 'Стаціонарна мережа'
    }
  };

  if (arsenalCards.length > 0 && blueprintDisplay) {
    arsenalCards.forEach(card => {
      card.addEventListener('click', () => {
        arsenalCards.forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        const key = card.dataset.weaponKey;
        const data = arsenalData[key];
        if (data) {
          blueprintDisplay.innerHTML = `
            <div class="bp-header">
              <span class="bp-tag">[ ТЕХНІЧНА СПЕЦИФІКАЦІЯ У ГРІ ]</span>
              <h4>${data.title}</h4>
              <p class="bp-sub">${data.subtitle}</p>
            </div>
            <div class="bp-grid">
              <div class="bp-stat"><span>Бойовий радіус:</span> <b>${data.range}</b></div>
              <div class="bp-stat"><span>Темп вогню:</span> <b>${data.rate}</b></div>
              <div class="bp-stat"><span>Готовність:</span> <b>${data.readiness}</b></div>
              <div class="bp-stat"><span>Мобільність:</span> <b>${data.mobility}</b></div>
            </div>
            <p class="bp-role"><strong>Тактична роль:</strong> ${data.role}</p>
          `;
        }
      });
    });
  }

  // --- 10. Modal Gallery Lightbox ---
  const galleryItems = document.querySelectorAll('.gallery figure');
  const lightbox = document.getElementById('gallery-lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxCap = document.getElementById('lightbox-caption');
  const lightboxClose = document.getElementById('lightbox-close');

  if (lightbox && lightboxImg && galleryItems.length > 0) {
    galleryItems.forEach(item => {
      item.addEventListener('click', () => {
        const img = item.querySelector('img');
        const cap = item.querySelector('figcaption');
        if (img) {
          lightboxImg.src = img.src;
          lightboxImg.alt = img.alt || '';
          if (lightboxCap) lightboxCap.textContent = cap ? cap.textContent : '';
          lightbox.hidden = false;
        }
      });
    });

    function closeLightbox() {
      if (lightbox) lightbox.hidden = true;
    }

    if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);
    lightbox.addEventListener('click', (e) => {
      if (e.target === lightbox) closeLightbox();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !lightbox.hidden) closeLightbox();
    });
  }

  // --- 11. News Category Filter ---
  const filterButtons = document.querySelectorAll('[data-news-filter]');
  const newsArticles = document.querySelectorAll('.news article');

  if (filterButtons.length > 0 && newsArticles.length > 0) {
    filterButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        filterButtons.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const filter = btn.dataset.newsFilter;

        newsArticles.forEach(art => {
          if (filter === 'all' || art.dataset.tag === filter) {
            art.style.display = 'grid';
          } else {
            art.style.display = 'none';
          }
        });
      });
    });
  }

  // --- 12. 3D Card Perspective Tilt Effect ---
  const tiltCards = document.querySelectorAll('.weapon-blueprint-card, .district-card, .kpi-pill');
  tiltCards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left - rect.width / 2;
      const y = e.clientY - rect.top - rect.height / 2;
      const rotX = -(y / (rect.height / 2)) * 6;
      const rotY = (x / (rect.width / 2)) * 6;
      card.style.transform = `perspective(800px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) translateY(-2px)`;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
});
