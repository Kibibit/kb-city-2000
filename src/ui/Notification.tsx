/**
 * Notification Component
 *
 * Displays milestone achievements and other notifications to the player.
 * Features animated entrance/exit and auto-dismissal.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useUIStore, type NotificationType } from '@/store';
import { audioManager } from '@/utils';
import './Notification.css';

/** Auto-dismiss duration in milliseconds */
const AUTO_DISMISS_DURATION = 4000;

/** Animation duration for CSS transitions */
const ANIMATION_DURATION = 300;

/**
 * Get icon for notification type
 */
function getNotificationIcon(type: NotificationType): string {
  switch (type) {
    case 'milestone':
      return '🎉';
    case 'warning':
      return '⚠️';
    case 'info':
      return 'ℹ️';
    case 'error':
      return '❌';
    case 'disaster':
      return '🚨';
    default:
      return '📢';
  }
}

/**
 * Notification component that displays messages with animations
 */
export function Notification() {
  const notification = useUIStore((state) => state.notification);
  const clearNotification = useUIStore((state) => state.clearNotification);
  
  // Track animation state for smooth exit
  const [isVisible, setIsVisible] = useState(false);
  const [isExiting, setIsExiting] = useState(false);
  
  // Track last notification ID to avoid replaying sound on re-renders
  const lastNotificationRef = useRef<string | null>(null);

  /**
   * Handle dismissal with animation
   */
  const handleDismiss = useCallback(() => {
    setIsExiting(true);
    setTimeout(() => {
      clearNotification();
      setIsExiting(false);
      setIsVisible(false);
    }, ANIMATION_DURATION);
  }, [clearNotification]);

  // Handle notification appearance and auto-dismiss
  useEffect(() => {
    if (notification) {
      // Create a unique ID for this notification to avoid replaying sounds
      const notificationId = `${notification.type}-${notification.message}`;
      
      // Show notification with animation
      setIsVisible(true);
      setIsExiting(false);

      // Play sound effect based on notification type (only for new notifications)
      if (lastNotificationRef.current !== notificationId) {
        lastNotificationRef.current = notificationId;
        if (notification.type === 'milestone') {
          audioManager.playSound('milestone');
        } else if (notification.type === 'error') {
          audioManager.playSound('error');
        }
      }

      // Set up auto-dismiss timer
      const timer = setTimeout(() => {
        handleDismiss();
      }, AUTO_DISMISS_DURATION);

      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
      lastNotificationRef.current = null;
    }
  }, [notification, handleDismiss]);

  // Don't render if no notification
  if (!notification || !isVisible) {
    return null;
  }

  const { message, type, subtitle } = notification;
  const icon = getNotificationIcon(type);

  return (
    <div
      className={`notification notification-${type} ${isExiting ? 'notification-exit' : 'notification-enter'}`}
      role="alert"
      aria-live="polite"
    >
      <div className="notification-content">
        <span className="notification-icon" aria-hidden="true">
          {icon}
        </span>
        <div className="notification-text">
          <span className="notification-message">{message}</span>
          {subtitle && (
            <span className="notification-subtitle">{subtitle}</span>
          )}
        </div>
      </div>
      <button
        className="notification-close"
        onClick={handleDismiss}
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
