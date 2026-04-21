import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { getSearchFilters, setSearchFilters } from '../../content/storage';
import { KIND_ICON } from '../../shared/icons';
import type {
    SearchMatch,
    SearchMatchField,
    SearchStartResponseData,
} from '../../shared/types/messages';

export type FilterKey = 'event' | 'transaction' | 'condition' | 'variable';

const FILTER_LABELS: Record<FilterKey, string> = {
    event: '이벤트',
    transaction: '트랜잭션',
    condition: '조건',
    variable: '변수',
};

// matchedField → 사용자에게 보여줄 한국어 라벨.
// 검색 결과 hover 시 툴팁(title)에 "라벨: 매칭된 값" 형태로 노출.
const MATCH_FIELD_LABEL: Record<SearchMatchField, string> = {
    varPrefix: '로직 prefix',
    displayText: '로직 명칭',
    eventId: '이벤트 ID',
    eventInputParamId: '이벤트 입력 파라미터 ID',
    eventInputParamEid: '이벤트 입력 바인딩',
    transactionId: '트랜잭션 ID',
    transactionInputParamId: '트랜잭션 입력 파라미터 ID',
    transactionOutParamId: '트랜잭션 출력 파라미터 ID',
    transactionInputParamSetParamId: '트랜잭션 입력 바인딩',
    variableId: '변수 ID',
    variableSetParamId: '변수 바인딩',
    conditionCondParamId: '조건 대상 ID',
    conditionCondParamValue: '조건 대상 값',
    conditionSetParamId: '조건 비교 ID',
    conditionSetParamValue: '조건 비교 값',
};

function buildMatchTooltip(match: SearchMatch): string {
    const label = MATCH_FIELD_LABEL[match.matchedField];
    if (!match.matchedValue) return label;
    return `${label}: ${match.matchedValue}`;
}

function renderSnippet(match: SearchMatch) {
    const { snippet, matchStart, matchEnd } = match;
    // displayText 이외의 필드(varPrefix, 타입별 상세)로 매칭된 경우
    // snippet 내부에 매칭 위치가 없어 matchStart/matchEnd가 -1로 들어온다.
    // 이 경우 하이라이트 없이 snippet만 표시. 매칭 필드 정보는 툴팁으로 제공.
    if (matchStart < 0 || matchEnd <= matchStart) {
        return <>{snippet}</>;
    }
    const before = snippet.slice(0, matchStart);
    const hit = snippet.slice(matchStart, matchEnd);
    const after = snippet.slice(matchEnd);
    return (
        <>
            {before}
            <strong>{hit}</strong>
            {after}
        </>
    );
}

interface SearchPanelProps {
    // 외부(단축키 트리거)에서 input 포커스를 요청하는 신호.
    // 값이 바뀔 때마다 input에 포커스하고 기존 텍스트를 전체 선택.
    focusSignal?: number;
}

export function SearchPanel({ focusSignal }: SearchPanelProps = {}) {
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
        // 비동기 메시지 응답 후 React 리렌더가 끝난 뒤 포커스 복구
        requestAnimationFrame(() => inputRef.current?.focus());
    };

    useEffect(() => {
        if (focusSignal === undefined || focusSignal <= 0) return;
        // 탭 전환 애니메이션/리렌더가 끝난 뒤 포커스. 기존 텍스트는 전체 선택해
        // 바로 새 검색어를 타이핑할 수 있게 함.
        requestAnimationFrame(() => {
            const el = inputRef.current;
            if (!el) return;
            el.focus();
            el.select();
        });
    }, [focusSignal]);

    // 패널이 닫히거나 다른 탭으로 전환되어 언마운트될 때 하이라이팅 제거
    useEffect(() => {
        return () => {
            chrome.runtime.sendMessage({ action: 'SEARCH_CLEAR' }).catch(() => {
                // 패널 닫힘 직후 메시지 채널이 끊어질 수 있음 - 무시
            });
        };
    }, []);

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
        setIsSearching(true);
        const response = await chrome.runtime.sendMessage({
            action: 'SEARCH_START',
            payload: { query: nextQuery, filters: nextFilters },
        });
        const data = response?.data as SearchStartResponseData | undefined;
        const nextMatches = data?.matches ?? [];
        setMatches(nextMatches);
        setCurrentIndex(nextMatches.length > 0 ? 0 : -1);
        setLastSearchedQuery(nextQuery);
        setSearched(true);
        setIsSearching(false);
        refocusInput();
    };

    const handleSearch = () => runSearch(query, filters);

    // 필터 토글 시, 이미 한 번 이상 검색한 적이 있으면 최신 필터로 자동 재검색.
    // 초기 마운트 시점에는 lastSearchedQuery가 비어있어 스킵됨.
    useEffect(() => {
        if (!lastSearchedQuery) return;
        queueMicrotask(() => {
            void runSearch(lastSearchedQuery, filters);
        });
        // runSearch는 매 렌더마다 재생성되지만, filters 변경 시점의 최신 state를 직접 전달하므로
        // 의존성에 포함할 필요가 없음.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [filters]);

    const handleClear = async () => {
        await chrome.runtime.sendMessage({ action: 'SEARCH_CLEAR' });
        setQuery('');
        resetSearchState();
        refocusInput();
    };

    const handleQueryChange = (newQuery: string) => {
        setQuery(newQuery);
        // 검색어를 모두 지우면 하이라이팅/결과도 함께 제거
        if (!newQuery && (matches.length > 0 || searched)) {
            chrome.runtime.sendMessage({ action: 'SEARCH_CLEAR' }).catch(() => {});
            resetSearchState();
        }
    };

    const navigateTo = async (index: number) => {
        if (matches.length === 0) return;
        const normalized = ((index % matches.length) + matches.length) % matches.length;
        setCurrentIndex(normalized);
        await chrome.runtime.sendMessage({
            action: 'SEARCH_NAVIGATE',
            payload: { matchId: matches[normalized].id },
        });
        refocusInput();
    };

    const handlePrev = () => navigateTo(currentIndex - 1);
    const handleNext = () => navigateTo(currentIndex + 1);
    const handleResultClick = (index: number) => navigateTo(index);

    const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            const hasResults = matches.length > 0 && query === lastSearchedQuery;
            if (hasResults) {
                if (e.shiftKey) {
                    navigateTo(currentIndex - 1);
                } else {
                    navigateTo(currentIndex + 1);
                }
            } else {
                handleSearch();
            }
            return;
        }
        // Escape 는 FloatingPanel 에서 패널 접기로 처리 (포커스가 지니 UI 안일 때)
    };

    const toggleFilter = (key: FilterKey) => {
        setFilters((prev) => ({ ...prev, [key]: !prev[key] }));
    };

    return (
        <div className="panel">
            {/* 검색 입력창 - 전체 너비 */}
            <div className="panel__search-wrap">
                <input
                    ref={inputRef}
                    className="panel__input"
                    type="text"
                    placeholder="검색어를 입력하세요"
                    value={query}
                    onChange={(e) => handleQueryChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                />
                {query && (
                    <button className="panel__input-clear" onClick={handleClear} aria-label="초기화">
                        <X size={13} />
                    </button>
                )}
                <button
                    className="panel__input-search"
                    onClick={handleSearch}
                    aria-label="검색"
                    disabled={isSearching}
                >
                    <Search size={15} />
                </button>
            </div>

            {/* 필터 옵션 */}
            <div className="panel__filters">
                {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => (
                    <button
                        key={key}
                        onClick={() => toggleFilter(key)}
                        className={`panel__filter-btn ${filters[key] ? 'panel__filter-btn--active' : ''}`}
                    >
                        {FILTER_LABELS[key]}
                    </button>
                ))}
            </div>

            {/* 검색 결과 컨테이너 */}
            {matches.length > 0 && (
                <div className="panel__results">
                    <div className="panel__results-header">
                        <span>
                            {currentIndex + 1} / {matches.length}
                        </span>
                        <div className="panel__results-nav">
                            <button
                                className="panel__results-nav-btn"
                                onClick={handlePrev}
                                aria-label="이전 결과"
                            >
                                <ChevronUp size={14} />
                            </button>
                            <button
                                className="panel__results-nav-btn"
                                onClick={handleNext}
                                aria-label="다음 결과"
                            >
                                <ChevronDown size={14} />
                            </button>
                        </div>
                    </div>
                    <ul className="panel__results-list">
                        {matches.map((m, i) => {
                            const Icon = KIND_ICON[m.kind];
                            return (
                                <li
                                    key={m.id}
                                    className={`panel__result-item ${i === currentIndex ? 'panel__result-item--active' : ''}`}
                                    onClick={() => handleResultClick(i)}
                                    title={buildMatchTooltip(m)}
                                >
                                    <span className="panel__result-seq">{m.seq || '-'}</span>
                                    <Icon
                                        className="panel__result-icon"
                                        aria-label={FILTER_LABELS[m.kind as FilterKey]}
                                    />
                                    <span className="panel__result-text">{renderSnippet(m)}</span>
                                </li>
                            );
                        })}
                    </ul>
                </div>
            )}

            {/* 상태 메시지 */}
            {isSearching && <p className="panel__hint">검색 중...</p>}

            {!isSearching && searched && matches.length === 0 && (
                <p className="panel__hint panel__hint--error">검색 결과가 없습니다.</p>
            )}

            {!searched && !isSearching && (
                <p className="panel__hint">검색어를 입력하고 Enter를 누르세요</p>
            )}
        </div>
    );
}
