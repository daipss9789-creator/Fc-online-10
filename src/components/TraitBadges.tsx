import React, { useState } from 'react';
import { FcoTraitMeta, resolveTraitMeta } from '../game/traits';

interface TraitBadgesProps {
  traits: string[];
  variant?: 'compact' | 'detailed' | 'inline-icons';
  maxItems?: number;
}

const TraitIconImg: React.FC<{
  meta: FcoTraitMeta;
  sizeClass: string;
}> = ({ meta, sizeClass }) => {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={`${sizeClass} inline-flex items-center justify-center rounded-full font-extrabold text-[9px] ${
          meta.tier === 'gold'
            ? 'bg-amber-500/30 text-amber-200 border border-amber-400/60'
            : 'bg-sky-500/20 text-sky-200 border border-sky-400/40'
        }`}
      >
        {meta.name.slice(0, 2).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={meta.iconUrl}
      alt={meta.name}
      title={`${meta.name} — ${meta.description}`}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={`${sizeClass} object-contain shrink-0 select-none drop-shadow-[0_2px_6px_rgba(0,0,0,0.85)]`}
    />
  );
};

/**
 * Renders authentic FC Online Hidden Trait icons (Chỉ Số Ẩn Vàng & Chỉ Số Ẩn Thường)
 * across Player Inspection Modals, Transfer Market Inspector, Upgrade Chamber, and XL Cards.
 */
export const TraitBadges: React.FC<TraitBadgesProps> = ({
  traits,
  variant = 'compact',
  maxItems,
}) => {
  const resolved = React.useMemo(() => {
    const items = (traits ?? []).map(resolveTraitMeta);
    // Sort Gold Traits first just like FC Online PC
    items.sort((a, b) => (a.tier === b.tier ? 0 : a.tier === 'gold' ? -1 : 1));
    return typeof maxItems === 'number' ? items.slice(0, maxItems) : items;
  }, [traits, maxItems]);

  if (resolved.length === 0) return null;

  if (variant === 'inline-icons') {
    return (
      <div className="flex items-center gap-1 flex-wrap">
        {resolved.map((meta, idx) => (
          <div
            key={`${meta.id}_${idx}`}
            title={`${meta.name}: ${meta.description}`}
            className="inline-flex items-center gap-1"
          >
            <TraitIconImg meta={meta} sizeClass="w-5 h-5" />
          </div>
        ))}
      </div>
    );
  }

  if (variant === 'detailed') {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {resolved.map((meta, idx) => {
          const isGold = meta.tier === 'gold';
          return (
            <div
              key={`${meta.id}_${idx}`}
              className={`flex items-center gap-2.5 p-2 rounded-lg border ${
                isGold
                  ? 'bg-gradient-to-r from-amber-950/55 via-[#131926] to-[#0b101b] border-amber-400/35'
                  : 'bg-[#0b111e] border-white/10'
              }`}
            >
              <TraitIconImg meta={meta} sizeClass="w-9 h-9" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className={`text-xs font-bold truncate ${
                      isGold ? 'text-amber-200' : 'text-slate-100'
                    }`}
                  >
                    {meta.name}
                  </span>
                  <span
                    className={`text-[9px] font-extrabold tracking-wider shrink-0 ${
                      isGold ? 'text-amber-400' : 'text-sky-400'
                    }`}
                  >
                    {isGold ? 'VÀNG' : 'ẨN'}
                  </span>
                </div>
                <p className="text-[10.5px] text-slate-400 leading-snug line-clamp-2 mt-0.5">
                  {meta.description}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  // Default: 'compact' (icon + label rows for Inspector / Card XL / Upgrade)
  return (
    <div className="flex flex-wrap gap-1.5">
      {resolved.map((meta, idx) => {
        const isGold = meta.tier === 'gold';
        return (
          <div
            key={`${meta.id}_${idx}`}
            title={`${meta.name} — ${meta.description}`}
            className={`inline-flex items-center gap-1.5 pr-2.5 pl-1 py-0.5 rounded border text-[11px] font-semibold ${
              isGold
                ? 'bg-amber-950/45 border-amber-400/40 text-amber-200'
                : 'bg-slate-900/90 border-white/12 text-slate-200'
            }`}
          >
            <TraitIconImg meta={meta} sizeClass="w-5 h-5" />
            <span className="whitespace-nowrap">{meta.name}</span>
          </div>
        );
      })}
    </div>
  );
};
