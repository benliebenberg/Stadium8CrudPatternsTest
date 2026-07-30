/**
 * Toast notification type definitions
 * Defines interfaces for the toast notification system
 */

/**
 * ToastVariant - Available toast notification variants
 */
export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

/**
 * Toast - Individual toast notification object
 */
export interface Toast {
  id: string;
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number; // Duration in milliseconds (default: 5000)
  dismissible?: boolean; // Whether user can manually dismiss (default: true)
  onClick?: () => void; // Optional click handler for interactive toasts
}

/**
 * ToastOptions - Options for creating a new toast
 * Used when calling showToast function
 */
export interface ToastOptions {
  variant: ToastVariant;
  title: string;
  message?: string;
  duration?: number;
  dismissible?: boolean;
  onClick?: () => void;
}

/**
 * ToastContextValue - Context value for toast provider
 * Provides toast state and functions to child components
 */
export interface ToastContextValue {
  toasts: Toast[];
  showToast: (options: ToastOptions) => void;
  dismissToast: (id: string) => void;
  clearAllToasts: () => void;
}

/**
 * ToastProps - Props for individual Toast component
 */
export interface ToastProps {
  toast: Toast;
  onDismiss: (id: string) => void;
}

/**
 * ToastContainerProps - Props for ToastContainer component
 * Optional position configuration for future enhancement
 */
export interface ToastContainerProps {
  position?:
    | 'top-right'
    | 'top-left'
    | 'bottom-right'
    | 'bottom-left'
    | 'top-center'
    | 'bottom-center';
  maxToasts?: number; // Maximum number of toasts to display at once (default: 3)
}

/**
 * Default toast configuration values
 */
export const TOAST_DEFAULTS = {
  DURATION: 5000, // 5 seconds
  MAX_TOASTS: 3,
  POSITION: 'top-right' as const,
  DISMISSIBLE: true,
} as const;

/*
 * There is deliberately NO variant→colour map here. A notification's colours are
 * resolved in `web/src/components/toast/Toast.tsx` from the semantic design tokens
 * (`--card`, `--destructive`, `--success`, `--warning`, `--muted-foreground`), so they
 * follow the active theme. The template's `TOAST_VARIANT_CONFIG` held raw Tailwind
 * palette classes, was imported by nothing, and was removed rather than token-ised —
 * token-ising it would only have relocated dead code and created a second, competing
 * source for the same styling.
 */
