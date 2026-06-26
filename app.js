// FastBag Aile Dağıtım Ağı - Pure JavaScript Application Logic

// ==================== STATE MANAGEMENT ====================
let state = {
  users: [],         // All registered user objects
  items: [],         // Materials list in the pool
  orders: [],        // All active/past orders
  currentUser: null, // Logged in user object
  currentTab: 'pool',// Active tab: 'pool', 'orders', 'profile'
  banner: {
    tag: 'Sistem Duyurusu',
    title: 'FastBag Dağıtım Ağı Yayında!',
    desc: 'Aile içi malzeme paylaşımını ve sipariş dağıtımını uçtan uca kolayca yönetebilirsiniz.'
  }
};

// ==================== GLOBAL APP INITIALIZATION ====================
document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();
  registerServiceWorker();
  initPWAInstallPrompt();
  setupEventListeners();
  updateGreeting();
  renderApp();
  
  // Update greeting every minute
  setInterval(updateGreeting, 60000);
});

// ==================== STORAGE SYNC ====================
function loadFromLocalStorage() {
  const users = localStorage.getItem('fb_users');
  const items = localStorage.getItem('fb_items');
  const orders = localStorage.getItem('fb_orders');
  const currentUser = localStorage.getItem('fb_current_user');
  const banner = localStorage.getItem('fb_banner');

  try {
    if (users) state.users = JSON.parse(users);
  } catch (e) {
    console.error("Error parsing users from LocalStorage", e);
    state.users = [];
  }

  try {
    if (items) state.items = JSON.parse(items);
  } catch (e) {
    console.error("Error parsing items from LocalStorage", e);
    state.items = [];
  }

  try {
    if (orders) state.orders = JSON.parse(orders);
  } catch (e) {
    console.error("Error parsing orders from LocalStorage", e);
    state.orders = [];
  }

  try {
    if (currentUser) state.currentUser = JSON.parse(currentUser);
  } catch (e) {
    console.error("Error parsing currentUser from LocalStorage", e);
    state.currentUser = null;
  }

  try {
    if (banner) state.banner = JSON.parse(banner);
  } catch (e) {
    console.error("Error parsing banner from LocalStorage", e);
  }

  // Auto-seed Admin in users database if it doesn't exist yet
  try {
    const adminExists = state.users.some(u => u.isAdmin);
    if (!adminExists) {
      const defaultAdmin = {
        id: 'admin_sys',
        name: 'Süper Yönetici',
        password: 'admin', // standard profile password, though Admin Login uses 095216
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=admin_sys`,
        points: 0,
        coupons: [],
        isAdmin: true,
        isCourier: false
      };
      state.users.push(defaultAdmin);
      saveToLocalStorage();
    }
  } catch (e) {
    console.error("Error seeding default admin", e);
  }
}

function saveToLocalStorage() {
  localStorage.setItem('fb_users', JSON.stringify(state.users));
  localStorage.setItem('fb_items', JSON.stringify(state.items));
  localStorage.setItem('fb_orders', JSON.stringify(state.orders));
  localStorage.setItem('fb_banner', JSON.stringify(state.banner));
  
  if (state.currentUser) {
    localStorage.setItem('fb_current_user', JSON.stringify(state.currentUser));
    
    // Sync current user modifications back into the users array
    const userIndex = state.users.findIndex(u => u.id === state.currentUser.id);
    if (userIndex !== -1) {
      state.users[userIndex] = state.currentUser;
      localStorage.setItem('fb_users', JSON.stringify(state.users));
    }
  } else {
    localStorage.removeItem('fb_current_user');
  }
}

// ==================== PWA: SERVICE WORKER & NOTIFICATIONS ====================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js')
        .then((registration) => {
          console.log('ServiceWorker registration successful with scope: ', registration.scope);
        })
        .catch((err) => {
          console.log('ServiceWorker registration failed: ', err);
        });
    });
  }
}

let deferredPrompt;
function initPWAInstallPrompt() {
  const installBtn = document.getElementById('btn-install');
  
  window.addEventListener('beforeinstallprompt', (e) => {
    // Prevent the mini-infobar from appearing on mobile
    e.preventDefault();
    // Stash the event so it can be triggered later.
    deferredPrompt = e;
    // Update UI notify the user they can install the PWA
    installBtn.classList.remove('hidden');
  });

  installBtn.addEventListener('click', () => {
    if (!deferredPrompt) {
      showToast('Kurulum dosyası henüz hazır değil veya uygulama zaten yüklü.', 'warning');
      return;
    }
    // Hide the app provided install promotion
    installBtn.classList.add('hidden');
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    deferredPrompt.userChoice.then((choiceResult) => {
      if (choiceResult.outcome === 'accepted') {
        showToast('Kurulum kabul edildi. FastBag yükleniyor!', 'success');
      } else {
        showToast('Kurulum iptal edildi.', 'warning');
        installBtn.classList.remove('hidden');
      }
      deferredPrompt = null;
    });
  });

  window.addEventListener('appinstalled', (evt) => {
    showToast('Tebrikler! FastBag cihazınıza başarıyla yüklendi.', 'success');
    installBtn.classList.add('hidden');
  });
}

// Request Notification Permission and Send Local System Notifications
function sendPushNotification(title, body) {
  if (!('Notification' in window)) {
    console.log('Bu tarayıcı bildirimleri desteklemiyor.');
    return;
  }

  const options = {
    body: body,
    icon: 'icon-192.png',
    vibrate: [200, 100, 200],
    data: {
      dateOfArrival: Date.now(),
      primaryKey: 1
    }
  };

  if (Notification.permission === 'granted') {
    triggerNotification(title, options);
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then((permission) => {
      if (permission === 'granted') {
        triggerNotification(title, options);
      }
    });
  }
}

function triggerNotification(title, options) {
  if (navigator.serviceWorker && navigator.serviceWorker.controller) {
    navigator.serviceWorker.ready.then((registration) => {
      registration.showNotification(title, options);
    });
  } else {
    new Notification(title, options);
  }
}

// ==================== UI STATE RENDERING ====================
function renderApp() {
  renderAuthScreen();
  
  if (!state.currentUser) {
    document.getElementById('header-user').classList.add('hidden');
    return;
  }

  // Update Header details
  document.getElementById('header-user').classList.remove('hidden');
  document.getElementById('header-user-avatar').src = state.currentUser.avatar;
  document.getElementById('header-user-name').textContent = state.currentUser.name;
  document.getElementById('header-user-points').textContent = `${state.currentUser.points} Puan`;

  // Render current active tab content
  renderTabContent();
  updateNavUI();
}

function renderAuthScreen() {
  const authScreen = document.getElementById('auth-screen');
  const bannerTag = document.getElementById('banner-tag');
  const bannerTitle = document.getElementById('banner-title');
  const bannerDesc = document.getElementById('banner-desc');
  const editBannerBtn = document.getElementById('btn-edit-banner');
  const membersList = document.getElementById('auth-members-list');
  const emptyMembersPlaceholder = document.getElementById('auth-members-empty');

  if (state.currentUser) {
    authScreen.classList.add('hidden');
    return;
  }

  // Show Auth Screen
  authScreen.classList.remove('hidden');

  // Load Announcement Banner
  bannerTag.textContent = state.banner.tag || 'Sistem Duyurusu';
  bannerTitle.textContent = state.banner.title || 'Duyuru Yayında!';
  bannerDesc.textContent = state.banner.desc || 'Açıklama bulunmuyor.';
  
  // Edit Banner Pen Button is visible only if currentUser was Admin (but wait, if no currentUser, nobody can edit it.
  // Wait, if an Admin logs out, we should hide it. Yes, since currentUser is null on auth screen, we hide the pencil button.
  // But wait, the instruction says: "Admin girişi yapıldığında bu afişin üzerinde küçük bir düzenleme kalemi belirir ve tıklandığında afiş metinlerini değiştirecek bir modal açar."
  // Wait! If Admin is logged in, the auth screen is HIDDEN! How can they click the banner on the login screen?
  // Ah! "Giriş ekranında gösterilecek etiket, başlık ve detaylı açıklama metnini tutar... Admin girişi yapıldığında bu afişin üzerinde küçük bir düzenleme kalemi belirir..."
  // This means that if the currentUser is logged in and is Admin, they can still view the login screen? Or does it mean when the Admin is logged in, the auth-screen is hidden but if they log out or if the auth-screen has a mode, they can edit it?
  // Actually, wait! The auth-screen might be shown as a modal or just when logged out. If Admin is currently logged in, maybe the pencil is visible even when the auth-screen is visible, OR we can show the announcement banner inside the Pool or Profile page?
  // Let's re-read carefully:
  // "Dinamik Duyuru Afişi: Giriş panelinin en üstünde yer alır. Sistem yöneticisinin (Admin) duyurularını gösterir. Admin girişi yapıldığında bu afişin üzerinde küçük bir düzenleme kalemi belirir ve tıklandığında afiş metinlerini değiştirecek bir modal açar."
  // Wait! If Admin is logged in, the login panel is hidden. But we can show the banner inside the Havuz (Pool) tab as well, or we can make the auth screen editable if Admin was the last user, or we can show the edit pencil when the active user is Admin, even if they are on the login screen?
  // Wait, if Admin is logged in, the auth-screen is hidden. How can they edit it?
  // Maybe they click something in the Pool tab to open the edit banner, or they can see the banner on the Pool tab too?
  // Let's also show the announcement banner inside the Pool page! That way, everyone can see it when logged in, and if the admin is logged in, they see the edit pencil in the Pool tab. That is very logical and keeps it user friendly!
  // Wait, or we can make the auth screen togglable, or when Admin is logged in, the login screen shows the pencil, and they can go back to view the login screen?
  // Let's look at the phrasing: "Admin girişi yapıldığında bu afişin üzerinde küçük bir düzenleme kalemi belirir".
  // If we show the Banner both on the Login Screen AND at the top of the Pool (Havuz) page, the admin can edit it on the Pool page or the Login page! This is extremely elegant.
  // Let's add the Banner markup to the Pool tab too, or just make sure if currentUser is Admin, we show the Pencil on the Login Screen's Banner (maybe the Admin can see the login screen via a "Profili Değiştir" or "Giriş Ekranını Gör" action, or they just edit it from their panel).
  // Actually, wait! If Admin is logged in, let's keep the Edit Banner modal accessible from the Admin controls in the Havuz page too, or let them click a button in the Profile page. Let's make the Pen button show up on the login banner if the *saved* session was Admin, or let's show the Pen button on the login screen if the admin is logged in? But if the admin is logged in, the login screen is hidden.
  // Let's look at this: we can render the announcement banner inside the Havuz tab as well! That is perfect. Let's dynamically inject it or render it inside Havuz tab. Let's check the HTML. We have `<section id="tab-content-pool"...`. Yes! We can display the banner there too. Let's render it at the top of the Pool page if there are items or if we want to display it.
  // Or, we can just make a button "Duyuruyu Düzenle" for Admin in the Pool page, and it opens the Edit Banner modal. When saved, it updates `state.banner` and LocalStorage. On the login screen, we can render the pen icon if the *admin* is logged in (wait, if logged in, auth-screen is hidden, so they won't see it). So having a "Duyuruyu Düzenle" button or showing the banner in the Pool tab is the perfect solution. Let's show the banner in both places! Let's write the JS to handle banner editing from the Pool tab as well.

  // Render members list
  membersList.innerHTML = '';
  // Filter users to exclude admin_sys and couriers to list only normal members
  const familyMembers = state.users.filter(u => !u.isAdmin && !u.isCourier);

  if (familyMembers.length === 0) {
    emptyMembersPlaceholder.classList.remove('hidden');
  } else {
    emptyMembersPlaceholder.classList.add('hidden');
    familyMembers.forEach(user => {
      const card = document.createElement('div');
      card.className = 'bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/50 hover:border-gold-500/50 rounded-2xl p-4 flex flex-col items-center justify-center cursor-pointer transition-all hover:-translate-y-1 text-center';
      card.innerHTML = `
        <img src="${user.avatar}" alt="${user.name}" class="w-14 h-14 rounded-2xl object-cover mb-2 border border-slate-600">
        <h4 class="text-xs font-bold text-slate-200 truncate w-full">${user.name}</h4>
        <span class="text-[9px] text-gold-500 font-bold mt-0.5">${user.points} Puan</span>
      `;
      card.addEventListener('click', () => handleUserLogin(user));
      membersList.appendChild(card);
    });
  }
}

function renderTabContent() {
  // Hide all panels
  document.getElementById('tab-content-pool').classList.add('hidden');
  document.getElementById('tab-content-orders').classList.add('hidden');
  document.getElementById('tab-content-profile').classList.add('hidden');

  // Show active panel
  const activePane = document.getElementById(`tab-content-${state.currentTab}`);
  if (activePane) activePane.classList.remove('hidden');

  // Render specific tab details
  if (state.currentTab === 'pool') {
    renderPoolTab();
  } else if (state.currentTab === 'orders') {
    renderOrdersTab();
  } else if (state.currentTab === 'profile') {
    renderProfileTab();
  }
}

function updateNavUI() {
  const tabs = ['pool', 'orders', 'profile'];
  tabs.forEach(tab => {
    const btn = document.getElementById(`nav-btn-${tab}`);
    if (btn) {
      if (tab === state.currentTab) {
        btn.classList.remove('text-slate-500', 'hover:text-slate-300');
        btn.classList.add('text-gold-500');
      } else {
        btn.classList.remove('text-gold-500');
        btn.classList.add('text-slate-500', 'hover:text-slate-300');
      }
    }
  });

  // Render order badge on orders nav button if there are active orders
  const activeOrdersCount = state.orders.filter(o => o.statusStep < 4).length;
  const badge = document.getElementById('nav-order-badge');
  if (activeOrdersCount > 0) {
    badge.classList.remove('hidden');
    badge.textContent = activeOrdersCount;
  } else {
    badge.classList.add('hidden');
  }
}

// ==================== TAB 1: POOL (HAVUZ) ====================
function renderPoolTab() {
  const poolGrid = document.getElementById('pool-grid');
  const poolEmpty = document.getElementById('pool-empty');
  const adminAddBtn = document.getElementById('btn-admin-add-item');

  // Show/Hide Admin Add Item button
  if (state.currentUser && state.currentUser.isAdmin) {
    adminAddBtn.classList.remove('hidden');
  } else {
    adminAddBtn.classList.add('hidden');
  }

  // Clear grid
  poolGrid.innerHTML = '';

  // Render dynamic Announcement Banner inside Pool Tab as well so users can read it logged in
  // And Admin can click the edit pencil here!
  const existingPoolBanner = document.getElementById('pool-announcement-banner');
  if (existingPoolBanner) {
    existingPoolBanner.remove();
  }

  const poolHeaderBlock = document.querySelector('#tab-content-pool > div');
  const poolBanner = document.createElement('div');
  poolBanner.id = 'pool-announcement-banner';
  poolBanner.className = 'mb-6 bg-gradient-to-r from-slate-800/80 to-slate-900/80 border border-slate-700/40 rounded-3xl p-5 relative overflow-hidden group shadow-lg';
  poolBanner.innerHTML = `
    <div class="absolute -right-8 -bottom-8 w-24 h-24 bg-gold-500/10 rounded-full blur-xl group-hover:bg-gold-500/20 transition-all duration-500"></div>
    ${state.currentUser && state.currentUser.isAdmin ? `
      <button onclick="openModal('modal-edit-banner')" class="absolute top-4 right-4 w-8 h-8 rounded-xl bg-slate-800/90 text-slate-400 hover:text-gold-500 hover:bg-slate-700 border border-slate-700 transition-all flex items-center justify-center">
        <i class="fa-solid fa-pen text-xs"></i>
      </button>
    ` : ''}
    <span class="inline-block bg-gold-500/20 text-gold-400 text-[9px] font-extrabold px-2 py-0.5 rounded-md uppercase tracking-wider mb-2">${state.banner.tag}</span>
    <h3 class="text-sm font-extrabold text-white leading-tight">${state.banner.title}</h3>
    <p class="text-xs text-slate-400 mt-1.5 leading-relaxed">${state.banner.desc}</p>
  `;
  // Insert after the greeting title block
  poolHeaderBlock.parentNode.insertBefore(poolBanner, poolHeaderBlock.nextSibling);

  if (state.items.length === 0) {
    poolGrid.classList.add('hidden');
    poolEmpty.classList.remove('hidden');
    return;
  }

  poolGrid.classList.remove('hidden');
  poolEmpty.classList.add('hidden');

  state.items.forEach(item => {
    const card = document.createElement('div');
    card.className = 'premium-card relative flex flex-col justify-between overflow-hidden group';
    
    // Fallback Unsplash image if custom image is not provided
    const imgUrl = item.image || `https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=600`;

    card.innerHTML = `
      <!-- Admin Delete Item Button -->
      ${state.currentUser && state.currentUser.isAdmin ? `
        <button onclick="deletePoolItem('${item.id}')" class="absolute top-3 right-3 z-10 w-8 h-8 rounded-xl bg-red-500 text-white hover:bg-red-600 transition-all flex items-center justify-center shadow-lg shadow-red-500/20">
          <i class="fa-solid fa-trash-can text-xs"></i>
        </button>
      ` : ''}
      
      <!-- Card Image -->
      <div class="relative h-44 w-full bg-slate-100 overflow-hidden">
        <img src="${imgUrl}" alt="${item.name}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500">
        <div class="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent opacity-60"></div>
      </div>
      
      <!-- Card Content -->
      <div class="p-5 flex-grow flex flex-col justify-between">
        <div>
          <h3 class="text-base font-bold text-slate-800 line-clamp-1">${item.name}</h3>
          <div class="flex items-center gap-1.5 mt-2">
            <span class="text-xs font-semibold text-slate-400">Değer:</span>
            <span class="text-sm font-extrabold text-gold-600">${item.price} Puan</span>
          </div>
        </div>
        
        <div class="mt-5">
          <button onclick="createOrder('${item.id}')" class="w-full btn-gold py-2.5 rounded-xl text-xs flex items-center justify-center gap-2">
            <i class="fa-solid fa-cart-flatbed-suitcase"></i>
            <span>İste / Sipariş Et</span>
          </button>
        </div>
      </div>
    `;
    poolGrid.appendChild(card);
  });
}

function deletePoolItem(id) {
  if (confirm('Bu malzemeyi havuzdan kalıcı olarak silmek istediğinize emin misiniz?')) {
    state.items = state.items.filter(item => item.id !== id);
    saveToLocalStorage();
    showToast('Malzeme havuzdan kaldırıldı.', 'info');
    renderPoolTab();
  }
}

function createOrder(itemId) {
  const item = state.items.find(i => i.id === itemId);
  if (!item) return;

  // Generate random unique 4 digit code
  let orderCode = '';
  let isUnique = false;
  while (!isUnique) {
    const rand = Math.floor(1000 + Math.random() * 9000);
    orderCode = `FB-${rand}`;
    isUnique = !state.orders.some(o => o.code === orderCode);
  }

  const newOrder = {
    id: 'order_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    code: orderCode,
    buyerId: state.currentUser.id,
    buyerName: state.currentUser.name,
    itemName: item.name,
    itemPrice: item.price,
    itemImage: item.image,
    status: 'Alındı',
    statusStep: 1, // 1: Alındı, 2: Hazırlanıyor, 3: Yolda, 4: Teslim Edildi
    date: new Date().toLocaleString('tr-TR'),
    courierId: null,
    courierName: null
  };

  state.orders.unshift(newOrder);
  saveToLocalStorage();

  showToast(`Siparişiniz Oluşturuldu! Kod: ${orderCode}`, 'success');
  
  // Auto-switch to Orders tab
  state.currentTab = 'orders';
  renderApp();
}

// ==================== TAB 2: ORDERS (SİPARİŞLER) ====================
function renderOrdersTab() {
  const ordersList = document.getElementById('orders-list');
  const ordersEmpty = document.getElementById('orders-empty');
  const courierClaimBar = document.getElementById('courier-claim-bar');
  const ordersSubtitle = document.getElementById('orders-subtitle');

  // Show/Hide Courier Claim Bar
  if (state.currentUser && state.currentUser.isCourier) {
    courierClaimBar.classList.remove('hidden');
    ordersSubtitle.textContent = 'Kurye yetkilisiniz. Dağıtımları zimmetleyebilir ve aşamaları güncelleyebilirsiniz.';
  } else {
    courierClaimBar.classList.add('hidden');
    ordersSubtitle.textContent = 'Aktif ve geçmiş siparişlerinizin durumunu izleyin.';
  }

  // Filter orders based on user role
  let filteredOrders = [];
  if (state.currentUser.isAdmin) {
    // Admin sees everything
    filteredOrders = state.orders;
  } else if (state.currentUser.isCourier) {
    // Courier sees only orders claimed by them or unclaimed orders?
    // Wait: "Kurye giriş yaptıysa sadece kendi üzerine zimmetlediği siparişleri görür."
    // Let's filter orders where courierId matches currentUser.id
    filteredOrders = state.orders.filter(o => o.courierId === state.currentUser.id);
  } else {
    // Normal user sees only their orders
    filteredOrders = state.orders.filter(o => o.buyerId === state.currentUser.id);
  }

  ordersList.innerHTML = '';

  if (filteredOrders.length === 0) {
    ordersList.classList.add('hidden');
    ordersEmpty.classList.remove('hidden');
    
    // Dynamic empty text description
    const emptyMsg = document.getElementById('orders-empty-msg');
    if (state.currentUser.isAdmin) {
      emptyMsg.textContent = 'Sistemde henüz hiçbir sipariş bulunmuyor.';
    } else if (state.currentUser.isCourier) {
      emptyMsg.textContent = 'Zimmetinize aldığınız aktif sipariş bulunmuyor. Üstteki panelden sipariş zimmetleyebilirsiniz.';
    } else {
      emptyMsg.textContent = 'Henüz hiç sipariş vermediniz. Havuz sekmesine giderek sipariş verebilirsiniz.';
    }
    return;
  }

  ordersList.classList.remove('hidden');
  ordersEmpty.classList.add('hidden');

  filteredOrders.forEach(order => {
    const card = document.createElement('div');
    card.className = 'premium-card overflow-hidden flex flex-col justify-between';

    // Timeline calculations
    let progressWidth = '12%';
    if (order.statusStep === 1) progressWidth = '12%';
    else if (order.statusStep === 2) progressWidth = '42%';
    else if (order.statusStep === 3) progressWidth = '72%';
    else if (order.statusStep === 4) progressWidth = '100%';

    const isStep1Active = order.statusStep === 1;
    const isStep2Active = order.statusStep === 2;
    const isStep3Active = order.statusStep === 3;
    const isStep4Active = order.statusStep === 4;

    const isStep1Done = order.statusStep >= 1;
    const isStep2Done = order.statusStep >= 2;
    const isStep3Done = order.statusStep >= 3;
    const isStep4Done = order.statusStep >= 4;

    // Check if current user is authorized to modify order status
    // Admin can update any order. Courier can update ONLY their claimed orders.
    const isAuthorizedToUpdate = state.currentUser.isAdmin || (state.currentUser.isCourier && order.courierId === state.currentUser.id);

    const imgUrl = order.itemImage || `https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=600`;

    card.innerHTML = `
      <!-- Order Card Header -->
      <div class="p-5 flex items-start justify-between border-b border-slate-100 flex-wrap gap-3">
        <div class="flex items-center gap-3">
          <div class="w-12 h-12 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex-shrink-0">
            <img src="${imgUrl}" alt="${order.itemName}" class="w-full h-full object-cover">
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-black text-mono text-slate-800">${order.code}</span>
              <span class="text-[10px] bg-slate-100 text-slate-500 font-bold px-2 py-0.5 rounded-md">${order.date}</span>
            </div>
            <h3 class="text-base font-bold text-slate-800 mt-1">${order.itemName}</h3>
          </div>
        </div>
        
        <div class="text-right">
          <div class="text-xs text-slate-400">İsteyen Üye</div>
          <div class="text-sm font-bold text-slate-800">${order.buyerName}</div>
        </div>
      </div>

      <!-- Courier Assignment Info -->
      <div class="px-5 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-xs flex-wrap gap-2">
        <div class="flex items-center gap-1.5 text-slate-500">
          <i class="fa-solid fa-motorcycle text-slate-400"></i>
          <span>Dağıtıcı Kurye:</span>
          <span class="font-bold text-slate-800">${order.courierName || 'Atanmadı'}</span>
        </div>
        <div class="flex items-center gap-1.5 text-slate-500">
          <span class="font-semibold text-slate-400">Değer:</span>
          <span class="font-black text-gold-600">${order.itemPrice} Puan</span>
        </div>
      </div>

      <!-- VISUAL PROGRESS BAR TIMELINE -->
      <div class="p-6 bg-slate-50/50">
        <div class="relative py-4">
          <!-- Background Line -->
          <div class="absolute top-1/2 left-0 right-0 h-1 bg-slate-200 -translate-y-1/2 rounded-full"></div>
          
          <!-- Colored Progress Line -->
          <div class="absolute top-1/2 left-0 h-1 bg-gradient-to-r from-gold-400 to-gold-500 -translate-y-1/2 rounded-full transition-all duration-500 timeline-track-glow" style="width: ${progressWidth}"></div>

          <!-- Station Dots -->
          <div class="relative flex items-center justify-between z-10">
            <!-- Station 1: Alındı -->
            <div class="flex flex-col items-center">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                isStep1Active ? 'bg-gold-500 text-slate-950 pulse-gold-glow scale-110' : (isStep1Done ? 'bg-gold-500 text-slate-950' : 'bg-slate-200 text-slate-400')
              }">
                <i class="fa-solid fa-file-invoice text-[10px]"></i>
              </div>
              <span class="text-[10px] font-bold mt-2 ${isStep1Done ? 'text-slate-800' : 'text-slate-400'}">Alındı</span>
            </div>

            <!-- Station 2: Hazırlanıyor -->
            <div class="flex flex-col items-center">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                isStep2Active ? 'bg-gold-500 text-slate-950 pulse-gold-glow scale-110' : (isStep2Done ? 'bg-gold-500 text-slate-950' : 'bg-slate-200 text-slate-400')
              }">
                <i class="fa-solid fa-box text-[10px]"></i>
              </div>
              <span class="text-[10px] font-bold mt-2 ${isStep2Done ? 'text-slate-800' : 'text-slate-400'}">Hazırlanıyor</span>
            </div>

            <!-- Station 3: Yolda -->
            <div class="flex flex-col items-center">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                isStep3Active ? 'bg-gold-500 text-slate-950 pulse-gold-glow scale-110' : (isStep3Done ? 'bg-gold-500 text-slate-950' : 'bg-slate-200 text-slate-400')
              }">
                <i class="fa-solid fa-truck-fast text-[10px]"></i>
              </div>
              <span class="text-[10px] font-bold mt-2 ${isStep3Done ? 'text-slate-800' : 'text-slate-400'}">Yolda</span>
            </div>

            <!-- Station 4: Teslim Edildi -->
            <div class="flex flex-col items-center">
              <div class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                isStep4Active ? 'bg-gold-500 text-slate-950' : 'bg-slate-200 text-slate-400'
              }">
                <i class="fa-solid fa-house-chimney-user text-[10px]"></i>
              </div>
              <span class="text-[10px] font-bold mt-2 ${isStep4Done ? 'text-slate-800' : 'text-slate-400'}">Teslim Edildi</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Action Buttons Area (Only visible to Admin or Claimed Courier, and only if not delivered) -->
      ${isAuthorizedToUpdate && order.statusStep < 4 ? `
        <div class="p-4 bg-slate-100/50 border-t border-slate-100 flex justify-end gap-2">
          ${order.statusStep === 1 ? `
            <button onclick="updateOrderStatus('${order.id}', 2)" class="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all">
              <i class="fa-solid fa-gears mr-1"></i> Hazırla
            </button>
          ` : ''}
          ${order.statusStep === 2 ? `
            <button onclick="updateOrderStatus('${order.id}', 3)" class="bg-blue-500 hover:bg-blue-600 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all">
              <i class="fa-solid fa-truck mr-1"></i> Yola Çıkar
            </button>
          ` : ''}
          ${order.statusStep === 3 ? `
            <button onclick="updateOrderStatus('${order.id}', 4)" class="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all">
              <i class="fa-solid fa-circle-check mr-1"></i> Teslim Et
            </button>
          ` : ''}
        </div>
      ` : ''}
    `;
    ordersList.appendChild(card);
  });
}

function updateOrderStatus(orderId, nextStep) {
  const order = state.orders.find(o => o.id === orderId);
  if (!order) return;

  order.statusStep = nextStep;
  
  if (nextStep === 2) {
    order.status = 'Hazırlanıyor';
    showToast(`${order.code} Hazırlanıyor aşamasına getirildi.`, 'info');
  } else if (nextStep === 3) {
    order.status = 'Yolda';
    showToast(`${order.code} Dağıtıma çıktı!`, 'success');
    sendPushNotification(
      'Siparişiniz Yolda! 🚀',
      `Sipariş kodlu ${order.code} ürününüz yola çıktı. En kısa sürede teslim edilecektir.`
    );
  } else if (nextStep === 4) {
    order.status = 'Teslim Edildi';
    showToast(`${order.code} başarıyla teslim edildi! +50 FastClub puanı kazanıldı.`, 'success');
    
    // Push notification to user
    sendPushNotification(
      'Siparişiniz Teslim Edildi! 🎉',
      `Sipariş kodlu ${order.code} başarıyla teslim edilmiştir. Afiyet olsun!`
    );

    // Reward points (+50 PTS) to the user who placed the order
    const buyer = state.users.find(u => u.id === order.buyerId);
    if (buyer) {
      buyer.points += 50;
      // If buyer is the currentUser, update currentUser as well to sync
      if (state.currentUser.id === buyer.id) {
        state.currentUser.points = buyer.points;
      }
    }
  }

  saveToLocalStorage();
  renderApp();
}

function claimOrderViaCode() {
  const claimInput = document.getElementById('input-claim-code');
  const code = claimInput.value.trim().toUpperCase();

  if (!code) {
    showToast('Lütfen geçerli bir sipariş kodu girin!', 'warning');
    return;
  }

  const order = state.orders.find(o => o.code === code);
  if (!order) {
    showToast('Sipariş bulunamadı! Lütfen kodu kontrol edin.', 'error');
    return;
  }

  if (order.courierId) {
    if (order.courierId === state.currentUser.id) {
      showToast('Bu sipariş zaten sizin zimmetinizde.', 'warning');
    } else {
      showToast(`Bu sipariş zaten başka bir kurye (${order.courierName}) tarafından zimmetlenmiş!`, 'error');
    }
    return;
  }

  // Claim order
  order.courierId = state.currentUser.id;
  order.courierName = state.currentUser.name;
  
  // Auto advance status to preparing if it was just received
  if (order.statusStep === 1) {
    order.statusStep = 2;
    order.status = 'Hazırlanıyor';
  }

  saveToLocalStorage();
  claimInput.value = '';
  showToast(`Sipariş ${code} başarıyla üzerinize zimmetlendi.`, 'success');
  renderApp();
}

// ==================== TAB 3: PROFILE & MARKET ====================
function renderProfileTab() {
  const avatar = document.getElementById('profile-avatar');
  const nameLabel = document.getElementById('profile-name');
  const roleLabel = document.getElementById('profile-role-text');
  const badgesBox = document.getElementById('profile-badges');
  const pointsLabel = document.getElementById('profile-points-large');
  const marketRestricted = document.getElementById('market-restricted-msg');
  const marketGrid = document.getElementById('market-items-grid');
  const couponsList = document.getElementById('coupons-list');
  const couponsEmpty = document.getElementById('coupons-empty');

  // Basic Details
  avatar.src = state.currentUser.avatar;
  nameLabel.textContent = state.currentUser.name;
  pointsLabel.textContent = state.currentUser.points;

  // Badges & Roles rendering
  badgesBox.innerHTML = '';
  if (state.currentUser.isAdmin) {
    roleLabel.textContent = 'Sistem Yöneticisi';
    badgesBox.innerHTML = `<span class="bg-red-500 text-white font-extrabold text-[9px] px-2 py-0.5 rounded-md uppercase tracking-wider shadow">ADMIN</span>`;
    
    // Disable reward market for Admins
    marketRestricted.classList.remove('hidden');
    marketGrid.classList.add('hidden');
  } else if (state.currentUser.isCourier) {
    roleLabel.textContent = 'Dağıtıcı Kurye';
    badgesBox.innerHTML = `<span class="bg-blue-500 text-white font-extrabold text-[9px] px-2 py-0.5 rounded-md uppercase tracking-wider shadow">KURYE</span>`;
    
    // Disable reward market for Couriers
    marketRestricted.classList.remove('hidden');
    marketGrid.classList.add('hidden');
  } else {
    roleLabel.textContent = 'Aile Üyesi';
    badgesBox.innerHTML = `<span class="bg-gold-500 text-slate-950 font-extrabold text-[9px] px-2 py-0.5 rounded-md uppercase tracking-wider shadow">ÜYE</span>`;
    
    // Enable reward market for normal users
    marketRestricted.classList.add('hidden');
    marketGrid.classList.remove('hidden');
  }

  // Render active coupons
  couponsList.innerHTML = '';
  const coupons = state.currentUser.coupons || [];

  if (coupons.length === 0) {
    couponsEmpty.classList.remove('hidden');
  } else {
    couponsEmpty.classList.add('hidden');
    coupons.forEach(coupon => {
      const item = document.createElement('div');
      item.className = 'bg-slate-900/60 border border-slate-800 rounded-2xl p-4 flex items-center justify-between gap-4';
      item.innerHTML = `
        <div class="flex items-center gap-3">
          <div class="w-9 h-9 bg-green-500/10 text-green-400 border border-green-500/20 rounded-xl flex items-center justify-center text-sm">
            <i class="fa-solid fa-gift"></i>
          </div>
          <div>
            <h4 class="text-xs font-bold text-slate-200">${coupon.name}</h4>
            <span class="text-[10px] font-mono tracking-widest text-gold-500 font-extrabold bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800 mt-1 inline-block">${coupon.code}</span>
          </div>
        </div>
        <button onclick="consumeCoupon('${coupon.id}')" class="bg-green-600 hover:bg-green-700 text-white text-xs font-bold px-4 py-2 rounded-xl transition-all shadow-md">Harca</button>
      `;
      couponsList.appendChild(item);
    });
  }
}

function buyReward(type) {
  if (state.currentUser.isAdmin || state.currentUser.isCourier) {
    showToast('Yöneticiler ve kuryeler ödül marketinden alışveriş yapamaz.', 'error');
    return;
  }

  let cost = 0;
  let code = '';
  let name = '';

  if (type === 'choco') {
    cost = 150;
    code = 'CIKO150';
    name = 'Bedava Çikolata Ödülü';
  } else if (type === 'vip') {
    cost = 300;
    code = 'JET300';
    name = 'VIP Öncelikli Dağıtım';
  }

  if (state.currentUser.points < cost) {
    showToast(`Yetersiz FastClub Puanı! Bu ödül için ${cost} puana ihtiyacınız var.`, 'error');
    return;
  }

  // Deduct points
  state.currentUser.points -= cost;
  
  // Add coupon
  if (!state.currentUser.coupons) state.currentUser.coupons = [];
  state.currentUser.coupons.push({
    id: 'coupon_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
    name: name,
    code: code
  });

  saveToLocalStorage();
  showToast(`${name} başarıyla satın alındı! Kod: ${code}`, 'success');
  renderApp();
}

function consumeCoupon(id) {
  if (!confirm('Bu kuponu harcamak istediğinize emin misiniz? Harcandıktan sonra listeden silinecektir.')) {
    return;
  }

  state.currentUser.coupons = state.currentUser.coupons.filter(c => c.id !== id);
  saveToLocalStorage();
  showToast('Kupon başarıyla harcandı ve silindi!', 'success');
  renderApp();
}

// ==================== AUTH & LOGIN LOGIC ====================
function handleUserLogin(user) {
  const enteredPass = prompt(`Lütfen "${user.name}" kullanıcısının giriş şifresini girin:`);
  
  if (enteredPass === null) return; // user cancelled

  if (enteredPass.trim() === user.password) {
    state.currentUser = user;
    saveToLocalStorage();
    showToast(`Hoş geldin, ${user.name}!`, 'success');
    renderApp();
  } else {
    showToast('Hatalı şifre girdiniz!', 'error');
  }
}

function handleCourierLogin() {
  const nameInput = document.getElementById('input-courier-name');
  const passInput = document.getElementById('input-courier-password');
  
  const courierName = nameInput.value.trim();
  const password = passInput.value.trim();

  if (!courierName || !password) {
    showToast('Lütfen tüm alanları doldurun!', 'warning');
    return;
  }

  if (password === 'kurye123') {
    // Check if courier account already exists in users list
    let courierUser = state.users.find(u => u.name === courierName && u.isCourier);
    
    if (!courierUser) {
      courierUser = {
        id: 'courier_' + Date.now(),
        name: courierName,
        password: 'kurye123',
        avatar: `https://api.dicebear.com/7.x/identicon/svg?seed=${encodeURIComponent(courierName)}`,
        points: 0,
        coupons: [],
        isAdmin: false,
        isCourier: true
      };
      state.users.push(courierUser);
    }

    state.currentUser = courierUser;
    saveToLocalStorage();

    // Clear inputs and close modal
    nameInput.value = '';
    passInput.value = '';
    closeModal('modal-courier-login');
    
    showToast(`Kurye Modu Aktif: ${courierName}`, 'success');
    
    // Switch to orders tab
    state.currentTab = 'orders';
    renderApp();
  } else {
    showToast('Geçersiz Kurye Şifresi!', 'error');
  }
}

function handleAdminLogin() {
  const passInput = document.getElementById('input-admin-password');
  const password = passInput.value.trim();

  if (!password) {
    showToast('Lütfen şifreyi girin!', 'warning');
    return;
  }

  if (password === '095216') {
    // Find or create admin in users list
    let adminUser = state.users.find(u => u.id === 'admin_sys');
    
    if (!adminUser) {
      adminUser = {
        id: 'admin_sys',
        name: 'Süper Yönetici',
        password: 'admin',
        avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=admin_sys`,
        points: 0,
        coupons: [],
        isAdmin: true,
        isCourier: false
      };
      state.users.push(adminUser);
    }

    state.currentUser = adminUser;
    saveToLocalStorage();

    // Clear and close
    passInput.value = '';
    closeModal('modal-admin-login');
    
    showToast('Süper Yönetici Modu Aktif!', 'success');
    renderApp();
  } else {
    showToast('Geçersiz Yönetici Şifresi!', 'error');
  }
}

function compressImage(file, callback) {
  if (!file) {
    callback(null);
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const MAX_WIDTH = 256;
      const MAX_HEIGHT = 256;
      let width = img.width;
      let height = img.height;

      if (width > height) {
        if (width > MAX_WIDTH) {
          height *= MAX_WIDTH / width;
          width = MAX_WIDTH;
        }
      } else {
        if (height > MAX_HEIGHT) {
          width *= MAX_HEIGHT / height;
          height = MAX_HEIGHT;
        }
      }

      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);

      // Compress to JPEG format with 0.7 quality factor
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      callback(dataUrl);
    };
    img.onerror = () => {
      callback(null);
    };
    img.src = e.target.result;
  };
  reader.onerror = () => {
    callback(null);
  };
  reader.readAsDataURL(file);
}

function registerNewUser() {
  const nameInput = document.getElementById('input-user-name');
  const passInput = document.getElementById('input-user-password');
  const fileInput = document.getElementById('input-user-file');

  const name = nameInput.value.trim();
  const password = passInput.value.trim();

  if (!name || !password) {
    showToast('İsim ve şifre alanları boş bırakılamaz!', 'warning');
    return;
  }

  const userExists = state.users.some(u => u.name.toLowerCase() === name.toLowerCase() && !u.isCourier);
  if (userExists) {
    showToast('Bu isimle kayıtlı bir aile üyesi zaten var!', 'error');
    return;
  }

  const proceedRegistration = (avatarUrl) => {
    const newUser = {
      id: 'user_' + Date.now(),
      name: name,
      password: password,
      avatar: avatarUrl,
      points: 0,
      coupons: [],
      isAdmin: false,
      isCourier: false
    };

    state.users.push(newUser);
    state.currentUser = newUser;
    saveToLocalStorage();

    // Clear inputs and close
    nameInput.value = '';
    passInput.value = '';
    fileInput.value = '';
    document.getElementById('label-user-file-name').textContent = 'Dosya seçilmedi';
    closeModal('modal-register');

    showToast(`Ailemize hoş geldin, ${name}!`, 'success');
    renderApp();
  };

  // Profile Picture check
  if (fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    compressImage(file, (compressedBase64) => {
      const avatarUrl = compressedBase64 || `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`;
      proceedRegistration(avatarUrl);
    });
  } else {
    // Generate avatar via dicebear api using username as seed
    const dicebearAvatar = `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(name)}`;
    proceedRegistration(dicebearAvatar);
  }
}

function logout() {
  state.currentUser = null;
  state.currentTab = 'pool';
  saveToLocalStorage();
  showToast('Oturum kapatıldı.', 'info');
  renderApp();
}

// ==================== ADMIN POOL & BANNER CONTROLS ====================
function saveAnnouncementBanner() {
  const tagInput = document.getElementById('input-banner-tag');
  const titleInput = document.getElementById('input-banner-title');
  const descInput = document.getElementById('input-banner-desc');

  state.banner.tag = tagInput.value.trim() || 'Sistem Duyurusu';
  state.banner.title = titleInput.value.trim() || 'FastBag Duyuru';
  state.banner.desc = descInput.value.trim() || 'Detay bulunmuyor.';

  saveToLocalStorage();
  closeModal('modal-edit-banner');
  showToast('Duyuru afişi başarıyla güncellendi.', 'success');
  
  // Re-render auth screen & pool banner
  renderAuthScreen();
  renderPoolTab();
}

function addNewItemToPool() {
  const nameInput = document.getElementById('input-item-name');
  const priceInput = document.getElementById('input-item-price');
  const fileInput = document.getElementById('input-item-file');

  const name = nameInput.value.trim();
  const price = parseInt(priceInput.value);

  if (!name || isNaN(price) || price <= 0) {
    showToast('Lütfen geçerli bir malzeme adı ve sanal fiyat girin!', 'warning');
    return;
  }

  const createItemObject = (imgBase64) => {
    const newItem = {
      id: 'item_' + Date.now(),
      name: name,
      price: price,
      image: imgBase64 // Base64 or null fallback
    };
    state.items.push(newItem);
    saveToLocalStorage();

    // Clear inputs and close
    nameInput.value = '';
    priceInput.value = '';
    fileInput.value = '';
    document.getElementById('label-item-file-name').textContent = 'Dosya seçilmedi';
    closeModal('modal-add-item');

    showToast('Yeni malzeme havuzuna eklendi.', 'success');
    renderPoolTab();
  };

  // Check image file
  if (fileInput.files && fileInput.files[0]) {
    const file = fileInput.files[0];
    compressImage(file, (compressedBase64) => {
      const imgUrl = compressedBase64 || `https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=600`;
      createItemObject(imgUrl);
    });
  } else {
    // Generate Unsplash generic placeholder image based on text name query
    const unsplashSearch = `https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&q=80&w=600`;
    createItemObject(unsplashSearch);
  }
}

// ==================== EVENT LISTENERS SETUP ====================
function setupEventListeners() {
  // Navigation Tabs Switch
  window.switchTab = (tabName) => {
    if (!state.currentUser) return;
    state.currentTab = tabName;
    renderApp();
  };

  // Auth Screen Modals open
  document.getElementById('btn-show-register').addEventListener('click', () => openModal('modal-register'));
  document.getElementById('btn-special-courier').addEventListener('click', () => openModal('modal-courier-login'));
  document.getElementById('btn-special-admin').addEventListener('click', () => openModal('modal-admin-login'));

  // Edit Banner modal trigger (Login banner pen click)
  document.getElementById('btn-edit-banner').addEventListener('click', () => {
    // Load existing banner data into modal inputs
    document.getElementById('input-banner-tag').value = state.banner.tag;
    document.getElementById('input-banner-title').value = state.banner.title;
    document.getElementById('input-banner-desc').value = state.banner.desc;
    openModal('modal-edit-banner');
  });

  // Save Banner trigger
  document.getElementById('btn-save-banner').addEventListener('click', saveAnnouncementBanner);

  // Admin Add Item modal trigger
  document.getElementById('btn-admin-add-item').addEventListener('click', () => {
    openModal('modal-add-item');
  });

  // Save Item trigger
  document.getElementById('btn-save-item').addEventListener('click', addNewItemToPool);

  // Save Register User trigger
  document.getElementById('btn-save-user').addEventListener('click', registerNewUser);

  // Courier login submit
  document.getElementById('btn-login-courier').addEventListener('click', handleCourierLogin);

  // Admin login submit
  document.getElementById('btn-login-admin').addEventListener('click', handleAdminLogin);

  // Zimmetle button trigger
  document.getElementById('btn-claim-order').addEventListener('click', claimOrderViaCode);

  // Logout button trigger
  document.getElementById('btn-logout').addEventListener('click', logout);

  // File Inputs Label listeners for dynamic label feedback
  document.getElementById('input-user-file').addEventListener('change', (e) => {
    const fileName = e.target.files[0] ? e.target.files[0].name : 'Dosya seçilmedi';
    document.getElementById('label-user-file-name').textContent = fileName;
  });

  document.getElementById('input-item-file').addEventListener('change', (e) => {
    const fileName = e.target.files[0] ? e.target.files[0].name : 'Dosya seçilmedi';
    document.getElementById('label-item-file-name').textContent = fileName;
  });
}

// ==================== TIME GREETINGS ENGINE ====================
function updateGreeting() {
  const greetingTitle = document.getElementById('greeting-title');
  if (!greetingTitle || !state.currentUser) return;

  const now = new Date();
  const hour = now.getHours();
  let greetingMsg = 'Merhaba! 👋';

  if (hour >= 5 && hour < 12) {
    greetingMsg = 'Günaydın ☀️';
  } else if (hour >= 12 && hour < 18) {
    greetingMsg = 'İyi Günler 🛒';
  } else if (hour >= 18 && hour < 23) {
    greetingMsg = 'İyi Akşamlar 🌙';
  } else {
    greetingMsg = 'İyi Geceler ✨';
  }

  greetingTitle.textContent = `${greetingMsg}, ${state.currentUser.name}!`;
}

// ==================== MODALS UTILITY FUNCTIONS ====================
window.openModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('modal-hidden');
    modal.classList.add('modal-visible');

    // Focus first input inside modal for accessibility
    const firstInput = modal.querySelector('input');
    if (firstInput) firstInput.focus();
  }
};

window.closeModal = (modalId) => {
  const modal = document.getElementById(modalId);
  if (modal) {
    modal.classList.remove('modal-visible');
    modal.classList.add('modal-hidden');
  }
};

// Close modals when clicking outside contents wrapper
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeModal(overlay.id);
    }
  });
});

// ==================== TOAST SYSTEM ====================
let toastTimeout;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toast-message');
  const toastIcon = document.getElementById('toast-icon');

  // Cancel previous timeout
  clearTimeout(toastTimeout);

  // Set message text
  toastMsg.textContent = message;

  // Set visual icons & borders based on status alert type
  toast.className = 'toast-container fixed top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-slate-800 border text-slate-100 px-6 py-4 rounded-2xl shadow-2xl max-w-sm w-[90%] ';
  
  if (type === 'success') {
    toast.classList.add('border-emerald-500/30');
    toastIcon.className = 'fa-solid fa-circle-check text-emerald-400';
  } else if (type === 'error') {
    toast.classList.add('border-rose-500/30');
    toastIcon.className = 'fa-solid fa-circle-exclamation text-rose-400';
  } else if (type === 'warning') {
    toast.classList.add('border-amber-500/30');
    toastIcon.className = 'fa-solid fa-triangle-exclamation text-amber-400';
  } else {
    toast.classList.add('border-slate-700');
    toastIcon.className = 'fa-solid fa-circle-info text-gold-500';
  }

  // Trigger Slide Down Animation
  toast.classList.remove('toast-hidden');
  toast.classList.add('toast-visible');

  // Auto Hide after 3.5s
  toastTimeout = setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.classList.add('toast-hidden');
  }, 3500);
}
