import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

/**
 * Themed replacement for a native `<select>`.
 *
 * A native select renders its option list with the OS widget, which ignores
 * every design token and looks foreign inside the app (and unreadable in dark
 * mode). This keeps the popup in the DOM so it inherits the theme, while
 * preserving the keyboard and screen-reader behaviour of a listbox.
 *
 * The popup is rendered through a portal with fixed positioning rather than as
 * an absolutely-positioned child. Cards in this app use `overflow-hidden` for
 * their rounded corners, which clips an in-flow popup; a portal escapes both
 * that and any local stacking context.
 */

export interface SelectMenuOption<T extends string = string> {
    value: T;
    label: string;
    /** Optional one-line explanation shown under the label in the popup. */
    hint?: string;
    icon?: LucideIcon;
}

interface SelectMenuProps<T extends string = string> {
    value: T;
    options: SelectMenuOption<T>[];
    onChange: (value: T) => void;
    /** Shown when `value` matches no option. */
    placeholder?: string;
    disabled?: boolean;
    className?: string;
    /** Mirrors the control for right-to-left languages. */
    dir?: 'ltr' | 'rtl';
    'aria-label'?: string;
}

interface PopupRect {
    top: number;
    left: number;
    width: number;
    /** Set when the popup had to flip above the trigger. */
    flipped: boolean;
}

const MAX_POPUP_HEIGHT = 288; // matches max-h-72
const GAP = 8;

export default function SelectMenu<T extends string = string>({
    value,
    options,
    onChange,
    placeholder = 'Select…',
    disabled = false,
    className = '',
    dir = 'ltr',
    'aria-label': ariaLabel,
}: SelectMenuProps<T>) {
    const [open, setOpen] = useState(false);
    const [activeIdx, setActiveIdx] = useState(0);
    const [rect, setRect] = useState<PopupRect | null>(null);

    const triggerRef = useRef<HTMLButtonElement>(null);
    const popupRef = useRef<HTMLUListElement>(null);
    const listId = useId();

    const selected = options.find((o) => o.value === value) ?? null;
    const SelectedIcon = selected?.icon;

    const measure = useCallback(() => {
        const el = triggerRef.current;
        if (!el) return;

        const r = el.getBoundingClientRect();
        const spaceBelow = window.innerHeight - r.bottom;
        const desired = Math.min(MAX_POPUP_HEIGHT, options.length * 56 + 12);
        // Flip above only when there genuinely isn't room below but there is above.
        const flipped = spaceBelow < desired + GAP && r.top > spaceBelow;

        setRect({
            top: flipped ? r.top - GAP : r.bottom + GAP,
            left: r.left,
            width: r.width,
            flipped,
        });
    }, [options.length]);

    useLayoutEffect(() => {
        if (open) measure();
    }, [open, measure]);

    // Keep the popup pinned to the trigger while the page moves under it.
    useEffect(() => {
        if (!open) return;

        const onScrollOrResize = () => measure();
        window.addEventListener('scroll', onScrollOrResize, true);
        window.addEventListener('resize', onScrollOrResize);
        return () => {
            window.removeEventListener('scroll', onScrollOrResize, true);
            window.removeEventListener('resize', onScrollOrResize);
        };
    }, [open, measure]);

    // Close on outside pointer-down / Escape. The popup lives in a portal, so
    // it has to be checked separately from the trigger.
    useEffect(() => {
        if (!open) return;

        const onPointerDown = (event: MouseEvent) => {
            const target = event.target as Node;
            if (triggerRef.current?.contains(target)) return;
            if (popupRef.current?.contains(target)) return;
            setOpen(false);
        };
        const onKey = (event: KeyboardEvent) => {
            if (event.key === 'Escape') setOpen(false);
        };

        document.addEventListener('mousedown', onPointerDown);
        document.addEventListener('keydown', onKey);
        return () => {
            document.removeEventListener('mousedown', onPointerDown);
            document.removeEventListener('keydown', onKey);
        };
    }, [open]);

    // Opening should land on the current selection, not the top of the list.
    useEffect(() => {
        if (!open) return;
        const idx = options.findIndex((o) => o.value === value);
        setActiveIdx(idx >= 0 ? idx : 0);
    }, [open, options, value]);

    const commit = (idx: number) => {
        const option = options[idx];
        if (!option) return;
        onChange(option.value);
        setOpen(false);
    };

    const onTriggerKeyDown = (event: React.KeyboardEvent) => {
        if (disabled) return;

        if (!open) {
            if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(event.key)) {
                event.preventDefault();
                setOpen(true);
            }
            return;
        }

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                setActiveIdx((i) => Math.min(options.length - 1, i + 1));
                break;
            case 'ArrowUp':
                event.preventDefault();
                setActiveIdx((i) => Math.max(0, i - 1));
                break;
            case 'Home':
                event.preventDefault();
                setActiveIdx(0);
                break;
            case 'End':
                event.preventDefault();
                setActiveIdx(options.length - 1);
                break;
            case 'Enter':
            case ' ':
                event.preventDefault();
                commit(activeIdx);
                break;
            case 'Tab':
                setOpen(false);
                break;
        }
    };

    const popup = open && rect && (
        <ul
            ref={popupRef}
            id={listId}
            role="listbox"
            dir={dir}
            style={{
                position: 'fixed',
                top: rect.flipped ? undefined : rect.top,
                bottom: rect.flipped ? window.innerHeight - rect.top : undefined,
                left: rect.left,
                width: rect.width,
                maxHeight: MAX_POPUP_HEIGHT,
                // Above the app header, which sits at z-50.
                zIndex: 120,
            }}
            className="overflow-y-auto p-1.5 rounded-xl border border-line/70 dark:border-line/20
                bg-surface-raised shadow-2xl shadow-black/15 dark:shadow-black/60"
        >
            {options.map((option, idx) => {
                const isSelected = option.value === value;
                const isActive = idx === activeIdx;
                const Icon = option.icon;

                return (
                    <li key={option.value} role="option" aria-selected={isSelected}>
                        <button
                            type="button"
                            onClick={() => commit(idx)}
                            onMouseEnter={() => setActiveIdx(idx)}
                            className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg transition-colors
                                ${dir === 'rtl' ? 'text-right flex-row-reverse' : 'text-left'}
                                ${isActive ? 'bg-primary/10' : ''}`}
                        >
                            {Icon && (
                                <Icon className={`w-4 h-4 mt-0.5 shrink-0 ${isSelected ? 'text-primary' : 'text-ink-subtle'}`} />
                            )}
                            <span className="flex-1 min-w-0">
                                <span className={`block text-sm font-bold truncate ${isSelected ? 'text-primary' : 'text-ink'}`}>
                                    {option.label}
                                </span>
                                {option.hint && (
                                    <span className="block text-[11px] font-medium text-ink-subtle leading-snug">
                                        {option.hint}
                                    </span>
                                )}
                            </span>
                            {isSelected && <Check className="w-4 h-4 shrink-0 text-primary mt-0.5" />}
                        </button>
                    </li>
                );
            })}
        </ul>
    );

    return (
        <div className={`relative ${className}`}>
            <button
                ref={triggerRef}
                type="button"
                role="combobox"
                dir={dir}
                aria-expanded={open}
                aria-haspopup="listbox"
                aria-controls={open ? listId : undefined}
                aria-label={ariaLabel}
                disabled={disabled}
                onClick={() => !disabled && setOpen((o) => !o)}
                onKeyDown={onTriggerKeyDown}
                className={`w-full flex items-center gap-2.5 pl-3.5 pr-2.5 py-2.5 rounded-xl border
                    ${dir === 'rtl' ? 'flex-row-reverse text-right' : 'text-left'}
                    bg-surface border-line/70 dark:border-line/20 text-ink
                    hover:border-primary/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/40
                    disabled:opacity-50 disabled:cursor-not-allowed transition-colors
                    ${open ? 'border-primary/60 ring-2 ring-primary/20' : ''}`}
            >
                {SelectedIcon && <SelectedIcon className="w-4 h-4 shrink-0 text-primary-soft" />}
                <span className={`flex-1 min-w-0 truncate text-sm font-bold ${selected ? 'text-ink' : 'text-ink-subtle'}`}>
                    {selected?.label ?? placeholder}
                </span>
                <ChevronDown
                    className={`w-4 h-4 shrink-0 text-ink-subtle transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
            </button>

            {popup && createPortal(popup, document.body)}
        </div>
    );
}
