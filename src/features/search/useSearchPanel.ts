import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { bindTargetMessages } from '../../shared/messaging';
import type { NotifyPanel } from '../../shared/panelNotice';
import { getSearchFilters, setSearchFilters } from '../../shared/storage';
import type { SearchMatch } from '../../shared/types/messages';

export type FilterKey = 'event' | 'transaction' | 'condition' | 'variable';

interface UseSearchPanelArgs {
    focusSignal?: number;
    notify: NotifyPanel;
    clearNotice: () => void;
    clearGuide: () => void;
}

export function useSearchPanel({
    focusSignal,
    notify,
    clearNotice,
    clearGuide,
}: UseSearchPanelArgs) {
    const [{ send: sendRuntimeMessage, sendQuietly: sendRuntimeMessageQuietly }] = useState(bindTargetMessages);
    const inputRef = useRef<HTMLInputElement>(null);
    const [query, setQuery] = useState('');
    const [lastSearchedQuery, setLastSearchedQuery] = useState('');
    const [matches, setMatches] = useState<SearchMatch[]>([]);
    const [currentIndex, setCurrentIndex] = useState(-1);
    const [searched, setSearched] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const [filters, setFilters] = useState<Record<FilterKey, boolean>>({
        event: true,
        transaction: true,
        condition: true,
        variable: true,
    });
    const [filtersHydrated, setFiltersHydrated] = useState(false);

    useEffect(() => {
        void getSearchFilters().then((stored) => {
            setFilters(stored);
            setFiltersHydrated(true);
        });
    }, []);

    useEffect(() => {
        if (!filtersHydrated) return;
        const t = window.setTimeout(() => {
            void setSearchFilters(filters);
        }, 250);
        return () => window.clearTimeout(t);
    }, [filters, filtersHydrated]);

    const refocusInput = () => {
        requestAnimationFrame(() => inputRef.current?.focus());
    };

    useEffect(() => {
        if (focusSignal === undefined || focusSignal <= 0) return;
        requestAnimationFrame(() => {
            const el = inputRef.current;
            if (!el) return;
            el.focus();
            el.select();
        });
    }, [focusSignal]);

    useEffect(() => {
        clearGuide();
        return () => {
            sendRuntimeMessageQuietly({ action: 'SEARCH_CLEAR' });
            clearGuide();
        };
    }, [clearGuide, sendRuntimeMessageQuietly]);

    const resetSearchState = () => {
        setLastSearchedQuery('');
        setMatches([]);
        setCurrentIndex(-1);
        setSearched(false);
    };

    const runSearch = async (
        nextQuery: string,
        nextFilters: Record<FilterKey, boolean>,
    ) => {
        if (!nextQuery.trim()) return;
        clearNotice();
        setIsSearching(true);
        try {
            const response = await sendRuntimeMessage({
                action: 'SEARCH_START',
                payload: { query: nextQuery, filters: nextFilters },
            });
            if (!response?.success) {
                notify(
                    'error',
                    typeof response?.error === 'string'
                        ? response.error
                        : '검색을 실행할 수 없습니다.',
                );
                setMatches([]);
                setCurrentIndex(-1);
                setSearched(true);
                return;
            }

            const nextMatches = response.data?.matches ?? [];
            setMatches(nextMatches);
            setCurrentIndex(nextMatches.length > 0 ? 0 : -1);
            setLastSearchedQuery(nextQuery);
            setSearched(true);
        } catch {
            notify('error', '검색 중 통신 오류가 발생했습니다.');
            setMatches([]);
            setCurrentIndex(-1);
            setSearched(true);
        } finally {
            setIsSearching(false);
            refocusInput();
        }
    };

    const handleSearch = () => runSearch(query, filters);

    useEffect(() => {
        if (!lastSearchedQuery) return;
        queueMicrotask(() => {
            void runSearch(lastSearchedQuery, filters);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    const handleClear = async () => {
        clearNotice();
        try {
            await sendRuntimeMessage({ action: 'SEARCH_CLEAR' });
        } catch {
            /* Extension context invalidated */
        }
        setQuery('');
        resetSearchState();
        refocusInput();
    };

    const handleQueryChange = (newQuery: string) => {
        setQuery(newQuery);
        if (!newQuery && (matches.length > 0 || searched)) {
            clearNotice();
            sendRuntimeMessageQuietly({ action: 'SEARCH_CLEAR' });
            resetSearchState();
        }
    };

    const navigateTo = async (index: number) => {
        if (matches.length === 0) return;
        const normalized = ((index % matches.length) + matches.length) % matches.length;
        setCurrentIndex(normalized);
        try {
            const response = await sendRuntimeMessage({
                action: 'SEARCH_NAVIGATE',
                payload: { matchId: matches[normalized].id },
            });
            if (!response?.success) {
                notify(
                    'error',
                    typeof response?.error === 'string'
                        ? response.error
                        : '검색 결과 위치로 이동할 수 없습니다.',
                );
            }
        } catch {
            notify('error', '검색 결과 이동 중 통신 오류가 발생했습니다.');
        }
        refocusInput();
    };

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== 'Enter') return;
        e.preventDefault();
        const hasResults = matches.length > 0 && query === lastSearchedQuery;
        if (!hasResults) {
            handleSearch();
            return;
        }
        void navigateTo(e.shiftKey ? currentIndex - 1 : currentIndex + 1);
    };

    const toggleFilter = (key: FilterKey) => {
        setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return {
        inputRef,
        query,
        matches,
        currentIndex,
        searched,
        isSearching,
        filters,
        handleSearch,
        handleClear,
        handleQueryChange,
        handleKeyDown,
        handlePrev: () => void navigateTo(currentIndex - 1),
        handleNext: () => void navigateTo(currentIndex + 1),
        handleResultClick: (index: number) => void navigateTo(index),
        toggleFilter,
    };
}
