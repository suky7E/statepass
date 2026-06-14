'use client';

import { useState, useEffect } from "react";
import {
  generatePassword,
  generatePassphrase,
  estimateStrength,
  StrengthEstimate,
  LessPassProfile
} from "../core/lesspass";
import {
  getStoredSession,
  clearSession,
  getLocalProfiles,
  saveLocalProfile,
  deleteLocalProfile,
  apiRegister,
  apiLogin,
  apiLogout,
  apiGetProfiles,
  apiSyncProfiles,
  Session,
  SavedProfile,
  DEFAULT_SERVER_URL
} from "../core/auth";
import styles from "./page.module.css";

export default function Home() {
  // Theme state
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Mode selection: 'password' or 'passphrase'
  const [mode, setMode] = useState<'password' | 'passphrase'>('password');

  // Input states
  const [masterPassword, setMasterPassword] = useState('');
  const [site, setSite] = useState('');
  const [login, setLogin] = useState('');

  // Password options
  const [length, setLength] = useState(16);
  const [lowercase, setLowercase] = useState(true);
  const [uppercase, setUppercase] = useState(true);
  const [digits, setDigits] = useState(true);
  const [symbols, setSymbols] = useState(true);

  // Passphrase options
  const [wordCount, setWordCount] = useState(6);
  const [separator, setSeparator] = useState('-');

  // Advanced options
  const [counter, setCounter] = useState(1);
  const [iterations, setIterations] = useState(600000);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Output states
  const [generatedResult, setGeneratedResult] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Strength state
  const [strength, setStrength] = useState<StrengthEstimate>({ score: 0, label: 'Very Weak', bits: 0 });

  // ─── Authentication States ──────────────────────────────────────────────────
  const [session, setSession] = useState<Session | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authTab, setAuthTab] = useState<'login' | 'register'>('login');
  
  // Auth Form inputs
  const [authEmail, setAuthEmail] = useState('');
  const [authUsername, setAuthUsername] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [syncServerUrl, setSyncServerUrl] = useState(DEFAULT_SERVER_URL);
  const [showSyncServerUrl, setShowSyncServerUrl] = useState(false);
  
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authSuccessMsg, setAuthSuccessMsg] = useState('');

  // ─── Profiles States ────────────────────────────────────────────────────────
  const [profiles, setProfiles] = useState<SavedProfile[]>([]);
  const [selectedProfileName, setSelectedProfileName] = useState('');
  const [isNamingProfile, setIsNamingProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [profileSyncStatus, setProfileSyncStatus] = useState<'synced' | 'local' | 'error'>('local');

  // Load theme & session on mount
  useEffect(() => {
    // Theme restore
    const savedTheme = localStorage.getItem("statepass_theme");
    if (savedTheme === "light" || savedTheme === "dark") {
      setTheme(savedTheme);
    } else {
      // Check system preference
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      setTheme(prefersDark ? "dark" : "light");
    }

    // Session restore
    const storedSession = getStoredSession();
    if (storedSession) {
      setSession(storedSession);
      setSyncServerUrl(storedSession.serverUrl);
    }
  }, []);

  // Theme Toggler
  const toggleTheme = () => {
    const nextTheme = theme === 'dark' ? 'light' : 'dark';
    setTheme(nextTheme);
    localStorage.setItem("statepass_theme", nextTheme);
  };

  // Load Profiles list when session changes
  const refreshProfilesList = async (currentSession: Session | null) => {
    if (currentSession) {
      try {
        const remoteProfiles = await apiGetProfiles(currentSession);
        setProfiles(remoteProfiles);
        setProfileSyncStatus('synced');
      } catch (err) {
        console.warn("Failed to fetch remote profiles, falling back to local profiles", err);
        setProfiles(getLocalProfiles());
        setProfileSyncStatus('error');
      }
    } else {
      setProfiles(getLocalProfiles());
      setProfileSyncStatus('local');
    }
  };

  useEffect(() => {
    refreshProfilesList(session);
  }, [session]);

  // Generate password/passphrase when inputs change
  useEffect(() => {
    let active = true;

    async function compute() {
      if (!masterPassword || !site) {
        setGeneratedResult('');
        setStrength({ score: 0, label: 'Very Weak', bits: 0 });
        setErrorMsg('');
        return;
      }

      setIsGenerating(true);
      setErrorMsg('');

      try {
        const profile: Partial<LessPassProfile> = {
          site,
          login,
          counter,
          iterations,
        };

        let result = '';
        if (mode === 'password') {
          profile.length = length;
          profile.lowercase = lowercase;
          profile.uppercase = uppercase;
          profile.digits = digits;
          profile.symbols = symbols;
          result = await generatePassword(masterPassword, profile);
        } else {
          profile.wordCount = wordCount;
          profile.separator = separator;
          result = await generatePassphrase(masterPassword, profile);
        }

        if (active) {
          setGeneratedResult(result);
          const est = estimateStrength(result);
          setStrength(est);
        }
      } catch (err: any) {
        if (active) {
          setErrorMsg(err.message || 'Error generating password');
          setGeneratedResult('');
        }
      } finally {
        if (active) {
          setIsGenerating(false);
        }
      }
    }

    compute();

    return () => {
      active = false;
    };
  }, [
    mode,
    masterPassword,
    site,
    login,
    length,
    lowercase,
    uppercase,
    digits,
    symbols,
    wordCount,
    separator,
    counter,
    iterations
  ]);

  // Copy to clipboard
  const handleCopy = async () => {
    if (!generatedResult) return;
    try {
      await navigator.clipboard.writeText(generatedResult);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard', err);
    }
  };

  // Reset fields
  const handleReset = () => {
    setMasterPassword('');
    setSite('');
    setLogin('');
    setLength(16);
    setLowercase(true);
    setUppercase(true);
    setDigits(true);
    setSymbols(true);
    setWordCount(6);
    setSeparator('-');
    setCounter(1);
    setIterations(600000);
    setErrorMsg('');
    setSelectedProfileName('');
  };

  // Strength helpers
  const getStrengthProgress = () => {
    const percentages = [20, 40, 60, 80, 100];
    return percentages[strength.score];
  };

  const getStrengthClass = () => {
    const classes = [styles.weakest, styles.weak, styles.fair, styles.strong, styles.strongest];
    return classes[strength.score];
  };

  // ─── Authentication Functions ───────────────────────────────────────────────
  
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setAuthSuccessMsg('');
    setAuthLoading(true);

    if (!authEmail || !authPassword) {
      setAuthError("Email/username and password are required.");
      setAuthLoading(false);
      return;
    }

    try {
      if (authTab === 'register') {
        if (!authUsername) {
          setAuthError("Username is required for registration.");
          setAuthLoading(false);
          return;
        }
        if (authPassword.length < 12) {
          setAuthError("Password must be at least 12 characters.");
          setAuthLoading(false);
          return;
        }
        
        await apiRegister(syncServerUrl, {
          email: authEmail,
          username: authUsername,
          password: authPassword
        });

        setAuthSuccessMsg("Registration successful! Logging you in...");
        
        // Log in immediately
        const userSession = await apiLogin(syncServerUrl, {
          email: authEmail,
          password: authPassword
        });
        setSession(userSession);
        setAuthSuccessMsg("Logged in successfully.");
        setTimeout(() => {
          setShowAuthModal(false);
          clearAuthForm();
        }, 1500);
      } else {
        // Login
        const userSession = await apiLogin(syncServerUrl, {
          email: authEmail,
          password: authPassword
        });
        setSession(userSession);
        setAuthSuccessMsg("Welcome back!");
        setTimeout(() => {
          setShowAuthModal(false);
          clearAuthForm();
        }, 1500);
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    if (session) {
      await apiLogout(session);
      setSession(null);
      handleReset();
    }
  };

  const clearAuthForm = () => {
    setAuthEmail('');
    setAuthUsername('');
    setAuthPassword('');
    setAuthError('');
    setAuthSuccessMsg('');
  };

  // ─── Profiles Functions ─────────────────────────────────────────────────────

  const handleLoadProfile = (profileName: string) => {
    setSelectedProfileName(profileName);
    if (!profileName) return;

    const p = profiles.find((item) => item.profileName === profileName);
    if (!p) return;

    setSite(p.site);
    setLogin(p.login);
    setLength(p.length || 16);
    setLowercase(p.lowercase !== false);
    setUppercase(p.uppercase !== false);
    setDigits(p.digits !== false);
    setSymbols(p.symbols !== false);
    setCounter(p.counter || 1);
    setIterations(p.iterations || 600000);
    
    if (p.wordCount !== undefined) {
      setMode('passphrase');
      setWordCount(p.wordCount);
      setSeparator(p.separator || '-');
    } else {
      setMode('password');
    }
  };

  const handleSaveProfileClick = () => {
    if (!site) {
      setErrorMsg("Site/Domain is required to save a profile.");
      return;
    }
    // Pre-fill a default name
    const defaultName = `${site} (${login || 'no login'})`.slice(0, 50);
    setNewProfileName(defaultName);
    setIsNamingProfile(true);
  };

  const handleSaveProfileConfirm = async () => {
    if (!newProfileName.trim()) {
      setIsNamingProfile(false);
      return;
    }

    const newProfile: SavedProfile = {
      profileName: newProfileName.trim(),
      site,
      login,
      length,
      lowercase,
      uppercase,
      digits,
      symbols,
      counter,
      iterations,
      ...(mode === 'passphrase' ? { wordCount, separator } : {})
    };

    try {
      if (session) {
        // Sync online: load all current profiles, append/update, and send full sync
        const currentProfiles = [...profiles];
        const index = currentProfiles.findIndex((p) => p.profileName === newProfile.profileName);
        if (index >= 0) {
          currentProfiles[index] = newProfile;
        } else {
          currentProfiles.push(newProfile);
        }
        await apiSyncProfiles(session, currentProfiles);
        await refreshProfilesList(session);
      } else {
        // Sync offline
        saveLocalProfile(newProfile);
        setProfiles(getLocalProfiles());
      }
      setSelectedProfileName(newProfile.profileName);
    } catch (err) {
      console.error("Failed to save profile", err);
      setErrorMsg("Failed to sync profile with server. Storing locally instead.");
      saveLocalProfile(newProfile);
      setProfiles(getLocalProfiles());
    } finally {
      setIsNamingProfile(false);
      setNewProfileName('');
    }
  };

  const handleDeleteProfile = async () => {
    if (!selectedProfileName) return;

    if (confirm(`Are you sure you want to delete profile "${selectedProfileName}"?`)) {
      try {
        if (session) {
          const updated = profiles.filter((p) => p.profileName !== selectedProfileName);
          await apiSyncProfiles(session, updated);
          await refreshProfilesList(session);
        } else {
          deleteLocalProfile(selectedProfileName);
          setProfiles(getLocalProfiles());
        }
        handleReset();
      } catch (err) {
        console.error("Failed to delete profile", err);
        setErrorMsg("Failed to delete profile from server.");
      }
    }
  };

  return (
    <div className={`${styles.page} ${theme === 'dark' ? styles.darkTheme : styles.lightTheme}`}>
      <div className={styles.ambientGlow} />

      {/* Top Navbar Actions */}
      <div className={styles.topActions}>
        {session ? (
          <div className={styles.authBadge}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span className={styles.userName}>{session.user.username}</span>
            <span>•</span>
            <button type="button" onClick={handleSignOut} className={styles.signOutBtn}>
              Sign Out
            </button>
          </div>
        ) : (
          <button
            type="button"
            className={styles.navBtn}
            onClick={() => {
              clearAuthForm();
              setAuthTab('login');
              setShowAuthModal(true);
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
            <span>Sign In / Sync</span>
          </button>
        )}

        <button
          type="button"
          onClick={toggleTheme}
          className={styles.themeToggle}
          title={theme === 'dark' ? "Switch to Light Mode" : "Switch to Dark Mode"}
          aria-label="Toggle Theme"
        >
          {theme === 'dark' ? (
            // Sun Icon
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="5"></circle>
              <line x1="12" y1="1" x2="12" y2="3"></line>
              <line x1="12" y1="21" x2="12" y2="23"></line>
              <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
              <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
              <line x1="1" y1="12" x2="3" y2="12"></line>
              <line x1="21" y1="12" x2="23" y2="12"></line>
              <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
              <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
            </svg>
          ) : (
            // Moon Icon
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          )}
        </button>
      </div>

      <main className={styles.main}>
        <div className={styles.header}>
          <h1 className={styles.title}>statepass</h1>
          <p className={styles.subtitle}>stateless password generator</p>
        </div>

        <div className={styles.generatorCard}>
          {/* Output Display */}
          <div className={styles.outputSection}>
            <div className={styles.outputWrapper}>
              <input
                type={showPassword ? "text" : "password"}
                readOnly
                value={
                  isGenerating 
                    ? "Generating..." 
                    : generatedResult || "Fill in Master Password & Site"
                }
                placeholder="Fill in Master Password & Site"
                className={`${styles.outputField} ${!generatedResult ? styles.placeholderText : ''}`}
                id="generated-password-display"
              />
              
              <div className={styles.outputActions}>
                {generatedResult && (
                  <>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className={styles.actionBtn}
                      title={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></path>
                          <line x1="1" y1="1" x2="23" y2="23"></line>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path>
                          <circle cx="12" cy="12" r="3"></circle>
                        </svg>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={handleCopy}
                      className={`${styles.actionBtn} ${copied ? styles.copiedBtn : ''}`}
                      title="Copy to clipboard"
                    >
                      {copied ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={styles.checkmarkIcon}>
                          <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                      ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                          <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                        </svg>
                      )}
                    </button>
                  </>
                )}
              </div>
            </div>

            {errorMsg && <div className={styles.errorBanner}>{errorMsg}</div>}

            {/* Strength Meter */}
            {generatedResult && (
              <div className={styles.strengthSection}>
                <div className={styles.strengthBarContainer}>
                  <div
                    className={`${styles.strengthProgress} ${getStrengthClass()}`}
                    style={{ width: `${getStrengthProgress()}%` }}
                  />
                </div>
                <div className={styles.strengthInfo}>
                  <span className={styles.strengthLabel}>{strength.label}</span>
                  <span className={styles.strengthBits}>{strength.bits} bits</span>
                </div>
              </div>
            )}
          </div>

          {/* Mode Tabs */}
          <div className={styles.modeTabs}>
            <button
              type="button"
              className={`${styles.tabBtn} ${mode === 'password' ? styles.activeTab : ''}`}
              onClick={() => setMode('password')}
            >
              Password
            </button>
            <button
              type="button"
              className={`${styles.tabBtn} ${mode === 'passphrase' ? styles.activeTab : ''}`}
              onClick={() => setMode('passphrase')}
            >
              Passphrase
            </button>
          </div>

          {/* Form Inputs */}
          <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
            <div className={styles.inputGroup}>
              <label htmlFor="master-password-input">Master Password</label>
              <input
                id="master-password-input"
                type="password"
                value={masterPassword}
                onChange={(e) => setMasterPassword(e.target.value)}
                placeholder="e.g. correct horse battery staple"
                autoComplete="off"
                className={styles.formInput}
              />
            </div>

            <div className={styles.row}>
              <div className={styles.inputGroup}>
                <label htmlFor="site-input">Site / Domain</label>
                <input
                  id="site-input"
                  type="text"
                  value={site}
                  onChange={(e) => setSite(e.target.value)}
                  placeholder="e.g. github.com"
                  autoComplete="off"
                  className={styles.formInput}
                />
              </div>

              <div className={styles.inputGroup}>
                <label htmlFor="login-input">Login / Username</label>
                <input
                  id="login-input"
                  type="text"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                  placeholder="e.g. email@domain.com"
                  autoComplete="off"
                  className={styles.formInput}
                />
              </div>
            </div>

            {/* Mode Specific Options */}
            {mode === 'password' ? (
              <div className={styles.optionsSection}>
                <div className={styles.sliderGroup}>
                  <div className={styles.sliderHeader}>
                    <span>Password Length</span>
                    <span className={styles.sliderVal}>{length}</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="64"
                    value={length}
                    onChange={(e) => setLength(parseInt(e.target.value))}
                    className={styles.slider}
                  />
                </div>

                <div className={styles.checkboxGrid}>
                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={lowercase}
                      onChange={(e) => setLowercase(e.target.checked)}
                      className={styles.checkbox}
                    />
                    <span>a-z (Lowercase)</span>
                  </label>

                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={uppercase}
                      onChange={(e) => setUppercase(e.target.checked)}
                      className={styles.checkbox}
                    />
                    <span>A-Z (Uppercase)</span>
                  </label>

                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={digits}
                      onChange={(e) => setDigits(e.target.checked)}
                      className={styles.checkbox}
                    />
                    <span>0-9 (Numbers)</span>
                  </label>

                  <label className={styles.checkboxLabel}>
                    <input
                      type="checkbox"
                      checked={symbols}
                      onChange={(e) => setSymbols(e.target.checked)}
                      className={styles.checkbox}
                    />
                    <span>!@#$ (Symbols)</span>
                  </label>
                </div>
              </div>
            ) : (
              <div className={styles.optionsSection}>
                <div className={styles.sliderGroup}>
                  <div className={styles.sliderHeader}>
                    <span>Word Count</span>
                    <span className={styles.sliderVal}>{wordCount}</span>
                  </div>
                  <input
                    type="range"
                    min="4"
                    max="12"
                    value={wordCount}
                    onChange={(e) => setWordCount(parseInt(e.target.value))}
                    className={styles.slider}
                  />
                </div>

                <div className={styles.inputGroup}>
                  <label htmlFor="separator-input">Separator</label>
                  <input
                    id="separator-input"
                    type="text"
                    value={separator}
                    onChange={(e) => setSeparator(e.target.value)}
                    placeholder="e.g. -"
                    className={styles.formInput}
                    maxLength={4}
                  />
                </div>
              </div>
            )}

            {/* Advanced Toggle */}
            <div className={styles.advancedToggleSection}>
              <button
                type="button"
                className={styles.advancedToggleBtn}
                onClick={() => setShowAdvanced(!showAdvanced)}
              >
                <span>Advanced Settings</span>
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className={`${styles.chevronIcon} ${showAdvanced ? styles.rotated : ''}`}
                >
                  <polyline points="6 9 12 15 18 9"></polyline>
                </svg>
              </button>
            </div>

            {/* Advanced Drawer */}
            {showAdvanced && (
              <div className={styles.advancedDrawer}>
                <div className={styles.row}>
                  <div className={styles.inputGroup}>
                    <label htmlFor="counter-input">Counter (Version)</label>
                    <input
                      id="counter-input"
                      type="number"
                      min="1"
                      value={counter}
                      onChange={(e) => setCounter(Math.max(1, parseInt(e.target.value) || 1))}
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.inputGroup}>
                    <label htmlFor="iterations-input">PBKDF2 Iterations</label>
                    <input
                      id="iterations-input"
                      type="number"
                      min="10000"
                      step="5000"
                      value={iterations}
                      onChange={(e) => setIterations(Math.max(10000, parseInt(e.target.value) || 10000))}
                      className={styles.formInput}
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Profiles panel */}
            <div className={styles.profilePanel}>
              <div className={styles.panelHeader}>
                <span className={styles.panelTitle}>
                  Profiles {profileSyncStatus === 'synced' ? '☁️' : '📁'}
                </span>
                {selectedProfileName && (
                  <button
                    type="button"
                    onClick={handleDeleteProfile}
                    className={`${styles.navBtn} ${styles.dangerBtn}`}
                    title="Delete selected profile"
                  >
                    Delete Selected
                  </button>
                )}
              </div>

              {profiles.length > 0 && (
                <select
                  value={selectedProfileName}
                  onChange={(e) => handleLoadProfile(e.target.value)}
                  className={styles.profileSelect}
                >
                  <option value="">-- Load Saved Profile --</option>
                  {profiles.map((p) => (
                    <option key={p.profileName} value={p.profileName}>
                      {p.profileName}
                    </option>
                  ))}
                </select>
              )}

              {isNamingProfile ? (
                <div className={styles.saveProfileInputWrapper}>
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="Profile name..."
                    className={styles.saveProfileInput}
                    maxLength={50}
                  />
                  <button
                    type="button"
                    onClick={handleSaveProfileConfirm}
                    className={styles.profileMiniBtn}
                  >
                    Confirm
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsNamingProfile(false)}
                    className={`${styles.profileMiniBtn} ${styles.dangerBtn}`}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className={styles.profileActions}>
                  <button
                    type="button"
                    onClick={handleSaveProfileClick}
                    className={styles.profileMiniBtn}
                    title="Save current inputs to profile"
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path>
                      <polyline points="17 21 17 13 7 13 7 21"></polyline>
                      <polyline points="7 3 7 8 15 8"></polyline>
                    </svg>
                    <span>Save Config</span>
                  </button>
                </div>
              )}
            </div>

            {/* Action Footer */}
            <div className={styles.formFooter}>
              <button
                type="button"
                onClick={handleReset}
                className={styles.resetBtn}
                title="Reset all settings to default"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"></path>
                </svg>
                <span>Reset All</span>
              </button>
            </div>
          </form>
        </div>
      </main>

      {/* Authentication Overlay Modal */}
      {showAuthModal && (
        <div className={styles.authOverlay}>
          <div className={styles.authCard}>
            <button
              type="button"
              onClick={() => {
                setShowAuthModal(false);
                clearAuthForm();
              }}
              className={styles.authCloseBtn}
              title="Close"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18"></line>
                <line x1="6" y1="6" x2="18" y2="18"></line>
              </svg>
            </button>

            <h2 className={styles.authTitle}>
              {authTab === 'login' ? 'Sign In' : 'Create Account'}
            </h2>

            {authError && <div className={styles.errorBanner}>{authError}</div>}
            {authSuccessMsg && (
              <div className={`${styles.errorBanner} ${styles.copiedBtn}`} style={{ color: 'hsl(150, 84%, 34%)', borderColor: 'rgba(16, 185, 129, 0.2)' }}>
                {authSuccessMsg}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className={styles.form} style={{ marginTop: '1rem' }}>
              <div className={styles.inputGroup}>
                <label htmlFor="auth-email-input">Email Address</label>
                <input
                  id="auth-email-input"
                  type="email"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  className={styles.formInput}
                />
              </div>

              {authTab === 'register' && (
                <div className={styles.inputGroup}>
                  <label htmlFor="auth-username-input">Username</label>
                  <input
                    id="auth-username-input"
                    type="text"
                    value={authUsername}
                    onChange={(e) => setAuthUsername(e.target.value)}
                    placeholder="e.g. user123"
                    required
                    className={styles.formInput}
                  />
                </div>
              )}

              <div className={styles.inputGroup}>
                <label htmlFor="auth-password-input">Password</label>
                <input
                  id="auth-password-input"
                  type="password"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  placeholder={authTab === 'register' ? "Minimum 12 characters" : "Password"}
                  required
                  minLength={authTab === 'register' ? 12 : undefined}
                  className={styles.formInput}
                />
              </div>

              {/* Sync Server toggle config */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowSyncServerUrl(!showSyncServerUrl)}
                  className={styles.syncServerToggleBtn}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`${styles.chevronIcon} ${showSyncServerUrl ? styles.rotated : ''}`}>
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                  <span>Sync Server Options</span>
                </button>
              </div>

              {showSyncServerUrl && (
                <div className={styles.inputGroup} style={{ animation: `${styles.drawerSlide} 0.25s ease` }}>
                  <label htmlFor="sync-server-url-input">Sync Server URL</label>
                  <input
                    id="sync-server-url-input"
                    type="url"
                    value={syncServerUrl}
                    onChange={(e) => setSyncServerUrl(e.target.value)}
                    placeholder={DEFAULT_SERVER_URL}
                    className={styles.formInput}
                  />
                </div>
              )}

              <button type="submit" disabled={authLoading} className={styles.submitBtn}>
                {authLoading ? 'Please wait...' : authTab === 'login' ? 'Sign In' : 'Register'}
              </button>

              <div className={styles.authSwitchText}>
                {authTab === 'login' ? (
                  <>
                    Don't have an account?
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('register');
                        setAuthError('');
                      }}
                      className={styles.authSwitchLink}
                    >
                      Register
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?
                    <button
                      type="button"
                      onClick={() => {
                        setAuthTab('login');
                        setAuthError('');
                      }}
                      className={styles.authSwitchLink}
                    >
                      Sign In
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
