import React, { createContext, useContext, useState, useEffect } from 'react';

interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string) => Promise<void>;
  register: (firstName: string, lastName: string, email: string) => Promise<void>;
  verifyToken: (token: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('sessionToken');
    if (token) {
      fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) => {
          if (res.ok) return res.json();
          throw new Error('Invalid token');
        })
        .then((userData) => setUser(userData))
        .catch(() => {
          localStorage.removeItem('sessionToken');
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email: string) => {
    const res = await fetch('/api/auth/login-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to request login');
    }
  };

  const register = async (firstName: string, lastName: string, email: string) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ firstName, lastName, email }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to register');
    }
  };

  const verifyToken = async (token: string) => {
    const res = await fetch('/api/auth/verify-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    });
    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.error || 'Failed to verify token');
    }
    const { user, sessionToken } = await res.json();
    localStorage.setItem('sessionToken', sessionToken);
    setUser(user);
  };

  const logout = () => {
    localStorage.removeItem('sessionToken');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, verifyToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
