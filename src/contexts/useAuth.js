import { useContext } from 'react';
import { AuthContext } from './AuthContextInstance';

// Separate file for the hook — required for Vite Fast Refresh compatibility
export const useAuth = () => useContext(AuthContext);
