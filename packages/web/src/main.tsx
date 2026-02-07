console.log('main.tsx: Script starting...');

import React from 'react';
console.log('main.tsx: React imported');

import ReactDOM from 'react-dom/client';
console.log('main.tsx: ReactDOM imported');

import App from './App.js';
console.log('main.tsx: App imported');

import './index.css';
console.log('main.tsx: CSS imported');

// 临时：清除旧的身份数据以便测试
// localStorage.removeItem('waku-chat-identity');
// console.log('main.tsx: Cleared old identity');

// Hide loading indicator
const loadingEl = document.getElementById('loading');
if (loadingEl) {
  loadingEl.style.display = 'none';
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
