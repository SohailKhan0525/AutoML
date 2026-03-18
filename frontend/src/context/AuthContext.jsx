import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

const safeParseUser = (rawUser) => {
  try {
    const parsed = JSON.parse(rawUser);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);

  const clearAuthState = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // Initialize auth state from localStorage
  useEffect(() => {
    let isMounted = true;

    const initializeAuth = async () => {
      const storedToken = localStorage.getItem('token');
      const storedUser = localStorage.getItem('user');

      if (!storedToken || !storedUser) {
        if (isMounted) setLoading(false);
        return;
      }

      const parsedUser = safeParseUser(storedUser);
      if (!parsedUser) {
        clearAuthState();
        if (isMounted) setLoading(false);
        return;
      }

      setToken(storedToken);
      setUser(parsedUser);

      const verifiedUser = await verifyToken(storedToken);
      if (!verifiedUser) {
        clearAuthState();
      }

      if (isMounted) setLoading(false);
    };

    initializeAuth();

    return () => {
      isMounted = false;
    };
  }, []);

  const verifyToken = async (authToken) => {
    try {
      const response = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      if (data?.user) {
        setUser(data.user);
        localStorage.setItem('user', JSON.stringify(data.user));
      }
      return data?.user ?? null;
    } catch (error) {
      console.error('Token verification failed:', error);
      return null;
    }
  };

  const signup = async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    const response = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || 'Signup failed');
    }

    const data = await response.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const login = async (email, password) => {
    const normalizedEmail = email.trim().toLowerCase();
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalizedEmail, password }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.detail || 'Login failed');
    }

    const data = await response.json();
    setToken(data.token);
    setUser(data.user);
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
  };

  const startOAuth = async (provider) => {
    const normalized = String(provider || '').toLowerCase();
    if (!['github', 'google'].includes(normalized)) {
      throw new Error('Unsupported OAuth provider.');
    }

    const response = await fetch(`/api/auth/oauth/${normalized}/start`);
    if (!response.ok) {
      let message = 'OAuth initialization failed.';
      try {
        const data = await response.json();
        message = typeof data?.detail === 'string' ? data.detail : (data?.detail?.message || message);
      } catch {
        // keep fallback
      }
      throw new Error(message);
    }

    const data = await response.json();
    if (!data?.authorization_url) {
      throw new Error('OAuth authorization URL missing.');
    }
    window.location.href = data.authorization_url;
  };

  const completeOAuth = async (oauthToken) => {
    if (!oauthToken) {
      throw new Error('Missing OAuth token.');
    }

    setToken(oauthToken);
    localStorage.setItem('token', oauthToken);
    const verifiedUser = await verifyToken(oauthToken);
    if (!verifiedUser) {
      clearAuthState();
      throw new Error('OAuth login verification failed.');
    }

    setUser(verifiedUser);
    localStorage.setItem('user', JSON.stringify(verifiedUser));
  };

  const logout = () => {
    clearAuthState();
  };

  return (
    <AuthContext.Provider value={{ user, token, loading, signup, login, logout, startOAuth, completeOAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};
