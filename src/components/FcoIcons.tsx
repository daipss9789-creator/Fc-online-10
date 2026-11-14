import React from 'react';

export type FcoIconId =
  | 'lobby'
  | 'squad'
  | 'market'
  | 'upgrade'
  | 'vault'
  | 'foosball'
  | 'shop'
  | 'vip'
  | 'leaderboard'
  | 'locker'
  | 'admin'
  | 'club'
  | 'missions'
  | 'events'
  | 'watchlist'
  | 'coach'
  | 'match'
  | 'glxh'
  | 'volta'
  | 'tactics'
  | 'shield_check';

interface FcoIconProps {
  name: FcoIconId;
  className?: string;
}

export const FcoIcon: React.FC<FcoIconProps> = ({ name, className = 'w-4 h-4' }) => {
  switch (name) {
    case 'lobby':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="3,4 21,4 12,20" />
          <polygon points="8.5,7.5 15.5,7.5 12,13.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'squad':
    case 'tactics':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="2.5" y="4" width="19" height="16" rx="1.5" />
          <line x1="12" y1="4" x2="12" y2="20" />
          <circle cx="12" cy="12" r="2.8" />
          <circle cx="7" cy="8.2" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="7" cy="15.8" r="1.15" fill="currentColor" stroke="none" />
          <circle cx="17" cy="12" r="1.15" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'market':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 16.5l5.5-5.5 3.5 3.5 8-8" />
          <polyline points="15 6.5 20 6.5 20 11.5" />
          <path d="M4 20h16" />
        </svg>
      );
    case 'upgrade':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polyline points="5 15 12 8 19 15" />
          <polyline points="5 10 12 3 19 10" />
          <line x1="12" y1="9" x2="12" y2="21" />
        </svg>
      );
    case 'vault':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="6,3 18,3 20,8 20,21 4,21 4,8" />
          <line x1="4" y1="8" x2="20" y2="8" />
          <polygon points="12,11 15,14.5 12,18 9,14.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'foosball':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9.2" />
          <polygon points="12,7.8 15.8,10.5 14.3,15 9.7,15 8.2,10.5" fill="currentColor" stroke="none" />
          <line x1="12" y1="2.8" x2="12" y2="7.8" />
          <line x1="15.8" y1="10.5" x2="20.6" y2="8.8" />
          <line x1="8.2" y1="10.5" x2="3.4" y2="8.8" />
          <line x1="14.3" y1="15" x2="17.5" y2="19.5" />
          <line x1="9.7" y1="15" x2="6.5" y2="19.5" />
        </svg>
      );
    case 'shop':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M5 7h14l-1.2 13H6.2L5 7z" />
          <path d="M9 7V5.5a3 3 0 0 1 6 0V7" />
          <polygon points="12,11 14,14 12,17 10,14" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'vip':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M3 17.5h18l-1.5-9.5-4.5 3.8-3-6.3-3 6.3-4.5-3.8L3 17.5z" />
          <line x1="4" y1="20.5" x2="20" y2="20.5" />
        </svg>
      );
    case 'leaderboard':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M7 4h10v5a5 5 0 0 1-10 0V4z" />
          <path d="M7 6H3.5v2a3 3 0 0 0 3.5 3" />
          <path d="M17 6h3.5v2a3 3 0 0 1-3.5 3" />
          <line x1="12" y1="14" x2="12" y2="19.5" />
          <path d="M7.5 20h9" />
        </svg>
      );
    case 'locker':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M15.5 4l5 3.2-2.2 4.3-2.3-1.4V20H8v-9.9L5.7 11.5 3.5 7.2 8.5 4a3.5 3.5 0 0 0 7 0z" />
          <line x1="12" y1="11" x2="12" y2="17" />
        </svg>
      );
    case 'admin':
    case 'shield_check':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 2l8 3.5V11c0 5.2-3.4 9.6-8 11-4.6-1.4-8-5.8-8-11V5.5L12 2z" />
          <polyline points="9 12 11 14 15.5 9.5" />
        </svg>
      );
    case 'club':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 3l7 3v5.5c0 4.5-3 8.2-7 9.5-4-1.3-7-5-7-9.5V6l7-3z" />
          <path d="M9 10h6M12 7v8" />
        </svg>
      );
    case 'missions':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="5" y="3" width="14" height="18" rx="2" />
          <line x1="9" y1="8" x2="15" y2="8" />
          <line x1="9" y1="12" x2="15" y2="12" />
          <line x1="9" y1="16" x2="12.5" y2="16" />
        </svg>
      );
    case 'events':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <rect x="3" y="8" width="18" height="4" rx="1" />
          <path d="M5 12v8h14v-8" />
          <line x1="12" y1="8" x2="12" y2="20" />
          <path d="M12 8H8.5a2 2 0 1 1 0-4C11 4 12 8 12 8z" />
          <path d="M12 8h3.5a2 2 0 1 0 0-4C13 4 12 8 12 8z" />
        </svg>
      );
    case 'watchlist':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <polygon points="12 3 14.9 8.8 21.3 9.7 16.6 14.2 17.7 20.6 12 17.6 6.3 20.6 7.4 14.2 2.7 9.7 9.1 8.8 12 3" />
        </svg>
      );
    case 'coach':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="7" r="3.5" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case 'match':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden="true">
          <polygon points="6,4 20,12 6,20" />
        </svg>
      );
    case 'glxh':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="12" cy="12" r="9" />
          <polygon points="10,8 16,12 10,16" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'volta':
      return (
        <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M4 17l4-10 4 6 4-6 4 10" />
        </svg>
      );
  }
};
