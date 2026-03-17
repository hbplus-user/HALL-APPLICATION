import { useState, useEffect } from 'react';
import { createContext, useContext } from 'react';

// Global notification context
export const NotificationContext = createContext(null);
export const useNotification = () => useContext(NotificationContext);

let globalShowNotification = null;

export const showNotification = (message, type = 'success') => {
  if (globalShowNotification) globalShowNotification(message, type);
};

export const NotificationProvider = ({ children }) => {
  const [notification, setNotification] = useState(null);

  useEffect(() => {
    globalShowNotification = (message, type) => {
      setNotification({ message, type });
      setTimeout(() => setNotification(null), 3000);
    };
    return () => { globalShowNotification = null; };
  }, []);

  return (
    <NotificationContext.Provider value={{ showNotification }}>
      {children}
      {notification && (
        <div className={`notification show ${notification.type}`}>
          {notification.message}
        </div>
      )}
    </NotificationContext.Provider>
  );
};

export default function NotificationSystem() {
  const [note, setNote] = useState(null);

  useEffect(() => {
    globalShowNotification = (message, type) => {
      setNote({ message, type });
      setTimeout(() => setNote(null), 3500);
    };
    return () => { globalShowNotification = null; };
  }, []);

  return note ? (
    <div className={`notification show ${note.type}`}>
      {note.message}
    </div>
  ) : null;
}
