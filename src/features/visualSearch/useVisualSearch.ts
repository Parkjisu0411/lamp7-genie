import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { isExtensionContextValid } from '../../shared/extensionContext';
import { bindTargetMessages, getMessageTarget } from '../../shared/messaging';
import type { NotifyPanel } from '../../shared/panelNotice';
import type { ExtensionMessage } from '../../shared/types/messages';
import type { VisualSearchFilters, VisualSearchResult } from './types';

const DEFAULT_FILTERS: VisualSearchFilters = { ids: true, text: true };
type Query = { query: string; filters: VisualSearchFilters };
export interface VisualSearchPanelProps {
    focusSignal?: number;
    notify: NotifyPanel;
    clearNotice(): void;
}

export function useVisualSearch({ focusSignal, notify, clearNotice }: VisualSearchPanelProps) {
    const [messages] = useState(bindTargetMessages);
    const [query, setQuery] = useState('');
    const [filters, setFilters] = useState(DEFAULT_FILTERS);
    const [result, setResult] = useState<VisualSearchResult>({ matches: [], activeId: null });
    const [searched, setSearched] = useState(false);
    const [isSearching, setIsSearching] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);
    const mounted = useRef(false);
    const generation = useRef(0);
    const submitted = useRef<Query | null>(null);
    const active = useRef<string | undefined>(undefined);
    const busy = useRef(false);
    const dirtyPending = useRef(false);
    const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
    const refresh = useRef<() => void>(() => {});
    const invalidate = useCallback(() => {
        generation.current++;
    }, []);

    const execute = useCallback(
        async (request: Query, scroll: boolean, activeId?: string, navigate = false) => {
            if (!mounted.current || getMessageTarget() !== messages.sessionId) return;
            const epoch = ++generation.current;
            busy.current = true;
            dirtyPending.current = false;
            setIsSearching(true);
            submitted.current = request;
            const current = () =>
                mounted.current &&
                generation.current === epoch &&
                getMessageTarget() === messages.sessionId;
            try {
                const response = await messages.send({
                    action: navigate ? 'VISUAL_SEARCH_NAVIGATE' : 'VISUAL_SEARCH_START',
                    payload: { ...request, activeId, scroll, requestId: crypto.randomUUID() },
                });
                if (!current()) return;
                if (!response.success || !response.data) {
                    setResult({ matches: [], activeId: null });
                    active.current = undefined;
                    notify('error', response.error ?? '화면 항목을 검색할 수 없습니다.');
                } else {
                    setResult(response.data);
                    active.current = response.data.activeId ?? undefined;
                    if (response.data.notice) notify('info', response.data.notice);
                }
                setSearched(true);
            } catch {
                if (current()) notify('error', '검색 중 통신 오류가 발생했습니다.');
            } finally {
                if (current()) {
                    busy.current = false;
                    setIsSearching(false);
                    if (dirtyPending.current) refresh.current();
                }
            }
        },
        [messages, notify],
    );

    useEffect(() => {
        mounted.current = true;
        return () => {
            mounted.current = false;
            invalidate();
            clearTimeout(refreshTimer.current);
            messages.sendQuietly({
                action: 'VISUAL_SEARCH_CLEAR',
                payload: { requestId: crypto.randomUUID() },
            });
        };
    }, [messages, invalidate]);

    useEffect(() => {
        const schedule = () => {
            if (!submitted.current) return;
            if (busy.current) {
                dirtyPending.current = true;
                return;
            }
            clearTimeout(refreshTimer.current);
            refreshTimer.current = setTimeout(() => {
                if (submitted.current) void execute(submitted.current, false, active.current);
            }, 180);
        };
        refresh.current = schedule;
        const onMessage = (message: ExtensionMessage) => {
            if (
                message.action === 'VISUAL_SEARCH_CHANGED' &&
                message.targetSessionId === messages.sessionId
            )
                schedule();
        };
        if (!isExtensionContextValid()) return;
        chrome.runtime.onMessage.addListener(onMessage);
        return () => {
            try {
                chrome.runtime.onMessage.removeListener(onMessage);
            } catch {
                /* unloaded */
            }
        };
    }, [execute, messages.sessionId]);

    useEffect(() => {
        if (!focusSignal) return;
        const id = requestAnimationFrame(() => {
            inputRef.current?.focus();
            inputRef.current?.select();
        });
        return () => cancelAnimationFrame(id);
    }, [focusSignal]);

    const clear = () => {
        generation.current++;
        submitted.current = null;
        active.current = undefined;
        busy.current = false;
        dirtyPending.current = false;
        clearTimeout(refreshTimer.current);
        setQuery('');
        setResult({ matches: [], activeId: null });
        setSearched(false);
        setIsSearching(false);
        clearNotice();
        messages.sendQuietly({
            action: 'VISUAL_SEARCH_CLEAR',
            payload: { requestId: crypto.randomUUID() },
        });
        inputRef.current?.focus();
    };
    const search = () => {
        if (!query.trim()) {
            clear();
            return;
        }
        clearNotice();
        void execute({ query: query.trim(), filters }, true);
    };
    const index = result.matches.findIndex((match) => match.id === result.activeId);
    const navigate = (next: number) => {
        if (!result.matches.length || !submitted.current) return;
        const match = result.matches[(next + result.matches.length) % result.matches.length];
        clearNotice();
        void execute(submitted.current, true, match.id, true);
    };
    const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
        if (event.nativeEvent.isComposing || event.keyCode === 229 || event.key !== 'Enter') return;
        event.preventDefault();
        if (submitted.current?.query === query.trim() && result.matches.length)
            navigate(index + (event.shiftKey ? -1 : 1));
        else search();
    };
    const toggle = (key: keyof VisualSearchFilters) => {
        const next = { ...filters, [key]: !filters[key] };
        setFilters(next);
        clearNotice();
        if (submitted.current)
            void execute({ ...submitted.current, filters: next }, false, active.current);
    };
    return {
        inputRef,
        query,
        filters,
        result,
        index,
        searched,
        isSearching,
        search,
        clear,
        navigate,
        onKeyDown,
        toggle,
        changeQuery: (value: string) => {
            if (!value) clear();
            else setQuery(value);
        },
    };
}
