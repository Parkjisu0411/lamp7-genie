import { ChevronDown, ChevronUp, EyeOff, Search, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { VisualSearchFilters } from './types';
import { useVisualSearch, type VisualSearchPanelProps } from './useVisualSearch';

const FILTERS: Record<keyof VisualSearchFilters, string> = {
    ids: 'ID',
    text: '이름·텍스트',
};

export function VisualSearchPanel(props: VisualSearchPanelProps) {
    const {
        inputRef,
        query,
        changeQuery,
        onKeyDown,
        clear,
        search,
        isSearching,
        filters,
        toggle,
        result,
        index: activeIndex,
        searched,
        navigate,
    } = useVisualSearch(props);
    const resultList = useRef<HTMLUListElement>(null);
    useEffect(() => {
        resultList.current
            ?.querySelector('[aria-current="true"]')
            ?.scrollIntoView({ block: 'nearest' });
    }, [result.activeId]);
    return (
        <div className="panel panel--visual-search">
            <div className="panel__search-wrap">
                <input
                    ref={inputRef}
                    className="panel__input"
                    type="text"
                    aria-label="화면 구성요소 검색어"
                    placeholder="ID · 이름 · 텍스트 검색"
                    value={query}
                    onChange={(event) => changeQuery(event.target.value)}
                    onKeyDown={onKeyDown}
                />
                {query && (
                    <button
                        type="button"
                        className="panel__input-clear"
                        onClick={clear}
                        aria-label="검색 초기화"
                    >
                        <X size={13} />
                    </button>
                )}
                <button
                    type="button"
                    className="panel__input-search"
                    onClick={search}
                    aria-label="검색"
                    disabled={isSearching}
                >
                    <Search size={15} />
                </button>
            </div>
            <div className="panel__filters" aria-label="검색 범위">
                {(Object.keys(FILTERS) as Array<keyof VisualSearchFilters>).map((key) => (
                    <button
                        type="button"
                        key={key}
                        aria-pressed={filters[key]}
                        onClick={() => toggle(key)}
                        className={`panel__filter-btn ${filters[key] ? 'panel__filter-btn--active' : ''}`}
                    >
                        {FILTERS[key]}
                    </button>
                ))}
            </div>
            <div className="panel__results-header" role="status" aria-live="polite">
                <span>
                    {isSearching
                        ? '검색 중…'
                        : result.matches.length
                          ? `${activeIndex + 1} / ${result.matches.length}개 항목`
                          : searched
                            ? '검색 결과 없음'
                            : '검색어 입력'}
                </span>
                {!!result.matches.length && (
                    <div className="panel__results-nav">
                        <button
                            type="button"
                            className="panel__results-nav-btn"
                            aria-label="이전 결과"
                            onClick={() => navigate(activeIndex - 1)}
                        >
                            <ChevronUp size={14} />
                        </button>
                        <button
                            type="button"
                            className="panel__results-nav-btn"
                            aria-label="다음 결과"
                            onClick={() => navigate(activeIndex + 1)}
                        >
                            <ChevronDown size={14} />
                        </button>
                    </div>
                )}
            </div>
            {!Object.values(filters).some(Boolean) && (
                <p className="panel__visual-help">검색 범위를 하나 이상 선택해 주세요.</p>
            )}
            {!!result.matches.length && (
                <div className="panel__results">
                    <ul className="panel__results-list" ref={resultList}>
                        {result.matches.map((match, index) => (
                            <li key={match.id}>
                                <button
                                    type="button"
                                    className={`panel__visual-result ${index === activeIndex ? 'panel__visual-result--active' : ''}`}
                                    aria-current={index === activeIndex ? 'true' : undefined}
                                    onClick={() => navigate(index)}
                                >
                                    {match.hidden && (
                                        <span className="panel__visual-hidden">
                                            <span className="panel__visual-hidden-title">
                                                <EyeOff size={14} aria-hidden="true" />
                                                현재 숨김
                                            </span>
                                            <span className="panel__visual-hidden-help">
                                                숨김 설정이나 비활성 탭을 확인해 주세요.
                                            </span>
                                        </span>
                                    )}
                                    <span className="panel__visual-result-title">
                                        <span className="panel__visual-kind">{match.type}</span>
                                        <span>
                                            {match.eid || match.locations[0]?.domId || 'ID 없음'}
                                        </span>
                                    </span>
                                    <span className="panel__visual-label">
                                        {match.label || '라벨 없음'}
                                    </span>
                                    {match.description && (
                                        <span className="panel__visual-description">
                                            {match.description}
                                        </span>
                                    )}
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <p className="panel__visual-help">Enter 다음 · Shift+Enter 이전</p>
        </div>
    );
}
