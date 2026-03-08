import type { DateRange } from '../../shared/types';

interface DateFilterProps {
  dateRange: DateRange;
  onChange: (range: DateRange) => void;
  totalCount: number;
  filteredCount: number;
}

export default function DateFilter({ dateRange, onChange, totalCount, filteredCount }: DateFilterProps) {
  return (
    <div className="date-filter">
      <div className="filter-header">
        <span className="filter-label">Filter by Date</span>
        <span className="filter-count">
          {filteredCount === totalCount
            ? `${totalCount} invoices`
            : `${filteredCount} of ${totalCount} invoices`}
        </span>
      </div>
      <div className="filter-inputs">
        <label>
          From
          <input
            type="date"
            value={dateRange.startDate || ''}
            onChange={(e) => onChange({ ...dateRange, startDate: e.target.value || null })}
          />
        </label>
        <label>
          To
          <input
            type="date"
            value={dateRange.endDate || ''}
            onChange={(e) => onChange({ ...dateRange, endDate: e.target.value || null })}
          />
        </label>
        {(dateRange.startDate || dateRange.endDate) && (
          <button
            className="btn btn-small"
            onClick={() => onChange({ startDate: null, endDate: null })}
          >
            Clear
          </button>
        )}
      </div>
    </div>
  );
}
