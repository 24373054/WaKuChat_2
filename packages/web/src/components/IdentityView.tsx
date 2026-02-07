/**
 * Identity View - Create or load identity
 * 简约现代风格
 */

import React, { useState, useEffect } from 'react';
import type { Identity } from '@waku-chat/sdk';
import { useApp } from '../context/AppContext.js';
import { saveIdentity, loadIdentity, hasIdentity, bytesToHex } from '../utils/storage.js';
import './IdentityView.css';

type Mode = 'select' | 'create' | 'import' | 'load';

export default function IdentityView() {
  const { setError, initializeClient } = useApp();
  const [mode, setMode] = useState<Mode>('select');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [importData, setImportData] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [createdIdentity, setCreatedIdentity] = useState<Identity | null>(null);

  useEffect(() => {
    if (hasIdentity()) {
      setMode('load');
    }
  }, []);

  const handleCreateIdentity = async (e: React.FormEvent) => {
    e.preventDefault();

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { Identity } = await import('@waku-chat/sdk/identity');
      const identity = Identity.create();
      const encrypted = await identity.export(password);
      saveIdentity(encrypted);
      setCreatedIdentity(identity);
      setPassword('');
      setConfirmPassword('');
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleContinueWithIdentity = async () => {
    if (!createdIdentity) return;

    setIsLoading(true);
    try {
      await initializeClient(createdIdentity);
    } catch (error) {
      setError((error as Error).message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleLoadIdentity = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!password) {
      setError('Password is required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const encrypted = loadIdentity();
      if (!encrypted) throw new Error('No identity found');

      const { Identity } = await import('@waku-chat/sdk/identity');
      const identity = await Identity.import(encrypted, password);
      await initializeClient(identity);
    } catch (error) {
      setError('Failed to load identity. Check your password.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleImportIdentity = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!importData) {
      setError('Import data is required');
      return;
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const { Identity } = await import('@waku-chat/sdk/identity');
      const identity = await Identity.import(importData, password);
      const encrypted = await identity.export(password);
      saveIdentity(encrypted);
      await initializeClient(identity);
    } catch (error) {
      setError('Failed to import identity. Check the data and password.');
    } finally {
      setIsLoading(false);
    }
  };

  // 选择页面
  if (mode === 'select') {
    return (
      <div className="identity-page">
        <div className="identity-card">
          <h1>Waku Chat</h1>
          <p className="subtitle">Secure, decentralized messaging</p>

          <div className="identity-actions">
            <button className="btn btn-primary" onClick={() => setMode('create')}>
              Create New Identity
            </button>
            <div className="divider">or</div>
            <button className="btn btn-secondary" onClick={() => setMode('import')}>
              Import Identity
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 创建成功页面
  if (mode === 'create' && createdIdentity) {
    return (
      <div className="identity-page">
        <div className="identity-card">
          <div className="success-icon">✓</div>
          <h1>Identity Created</h1>
          <p className="subtitle">Save your credentials</p>

          <div className="identity-info">
            <div className="label">User ID</div>
            <div className="value truncate">{createdIdentity.userId}</div>
          </div>

          <div className="identity-info">
            <div className="label">Public Key</div>
            <div className="value" style={{ fontSize: '11px' }}>
              {bytesToHex(createdIdentity.publicKey).slice(0, 64)}...
            </div>
          </div>

          <div className="warning-text">
            <span>⚠️</span>
            <span>Share your User ID and Public Key with others to receive messages.</span>
          </div>

          <div className="identity-actions">
            <button
              className="btn btn-primary"
              onClick={handleContinueWithIdentity}
              disabled={isLoading}
            >
              {isLoading ? <><span className="spinner"></span> Connecting...</> : 'Continue'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // 创建身份页面
  if (mode === 'create') {
    return (
      <div className="identity-page">
        <div className="identity-card">
          <h1>Create Identity</h1>
          <p className="subtitle">Choose a password to protect your identity</p>

          <form className="identity-form" onSubmit={handleCreateIdentity}>
            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                required
              />
            </div>

            <div className="form-group">
              <label>Confirm Password</label>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter password"
                required
              />
            </div>

            <div className="identity-actions">
              <button type="submit" className="btn btn-primary" disabled={isLoading}>
                {isLoading ? <><span className="spinner"></span> Creating...</> : 'Create'}
              </button>
              <button
                type="button"
                className="btn btn-text"
                onClick={() => setMode('select')}
                disabled={isLoading}
              >
                Back
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // 导入身份页面
  if (mode === 'import') {
    return (
      <div className="identity-page">
        <div className="identity-card">
          <h1>Import Identity</h1>
          <p className="subtitle">Paste your encrypted identity data</p>

          <form className="identity-form" onSubmit={handleImportIdentity}>
            <div className="form-group">
              <label>Identity Data (JSON)</label>
              <textarea
                className="input"
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder="Paste encrypted identity JSON"
                rows={4}
                style={{ resize: 'vertical', minHeight: '80px' }}
                required
              />
            </div>

            <div className="form-group">
              <label>Password</label>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password for imported identity"
                required
              />
            </div>

            <div className="form-group">
              <label>New Password</label>
              <input
                type="password"
                className="input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="New password to protect identity"
                required
              />
            </div>

            <div className="identity-actions">
              <button type="submit" className="btn btn-primary" disabled={isLoading}>
                {isLoading ? <><span className="spinner"></span> Importing...</> : 'Import'}
              </button>
              <button
                type="button"
                className="btn btn-text"
                onClick={() => setMode('select')}
                disabled={isLoading}
              >
                Back
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // 加载身份页面 (mode === 'load')
  return (
    <div className="identity-page">
      <div className="identity-card">
        <h1>Welcome Back</h1>
        <p className="subtitle">Enter your password to unlock</p>

        <form className="identity-form" onSubmit={handleLoadIdentity}>
          <div className="form-group">
            <label>Password</label>
            <input
              type="password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
              autoFocus
            />
          </div>

          <div className="identity-actions">
            <button type="submit" className="btn btn-primary" disabled={isLoading}>
              {isLoading ? <><span className="spinner"></span> Unlocking...</> : 'Unlock'}
            </button>
            <button
              type="button"
              className="btn btn-text"
              onClick={() => setMode('select')}
              disabled={isLoading}
            >
              Use Different Identity
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
