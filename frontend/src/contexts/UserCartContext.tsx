import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { CartItem, ProductItem } from '../data/mockData';
import { api } from '../services/api';

interface UserCartContextType {
  cart: CartItem[];
  cartCount: number;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  isLoading: boolean;
  addToCart: (product: ProductItem, quantity?: number) => Promise<void>;
  updateQuantity: (productId: string, quantity: number) => Promise<void>;
  removeFromCart: (productId: string) => Promise<void>;
  clearCart: () => Promise<void>;
  refreshCart: () => Promise<void>;
}

const UserCartContext = createContext<UserCartContextType | undefined>(undefined);

export const UserCartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshCart = useCallback(async () => {
    try {
      const items = await api.cart.get();
      setCart(items);
    } catch (e) {
      console.error('Failed to load cart', e);
    }
  }, []);

  useEffect(() => {
    refreshCart();
  }, [refreshCart]);

  const addToCart = async (product: ProductItem, quantity = 1) => {
    setIsLoading(true);
    try {
      const updated = await api.cart.add(product, quantity);
      setCart(updated);
    } finally {
      setIsLoading(false);
    }
  };

  const updateQuantity = async (productId: string, quantity: number) => {
    setIsLoading(true);
    try {
      const updated = await api.cart.updateQuantity(productId, quantity);
      setCart(updated);
    } finally {
      setIsLoading(false);
    }
  };

  const removeFromCart = async (productId: string) => {
    setIsLoading(true);
    try {
      const updated = await api.cart.remove(productId);
      setCart(updated);
    } finally {
      setIsLoading(false);
    }
  };

  const clearCart = async () => {
    setIsLoading(true);
    try {
      await api.cart.clear();
      setCart([]);
    } finally {
      setIsLoading(false);
    }
  };

  const cartCount = cart.reduce((sum, it) => sum + it.quantity, 0);
  const subtotal = cart.reduce((sum, it) => sum + it.product.price * it.quantity, 0);
  const discount = subtotal > 5000000 ? 200000 : subtotal > 2000000 ? 100000 : 0;
  const tax = Math.round(subtotal * 0.08); // 8% VAT
  const total = Math.max(0, subtotal - discount + tax);

  return (
    <UserCartContext.Provider
      value={{
        cart,
        cartCount,
        subtotal,
        discount,
        tax,
        total,
        isLoading,
        addToCart,
        updateQuantity,
        removeFromCart,
        clearCart,
        refreshCart,
      }}
    >
      {children}
    </UserCartContext.Provider>
  );
};

export const useUserCart = (): UserCartContextType => {
  const context = useContext(UserCartContext);
  if (!context) {
    throw new Error('useUserCart must be used within a UserCartProvider');
  }
  return context;
};
