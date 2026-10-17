import { ReactNode } from "react";

interface FilterOption {
  value: string;
  label: string;
}

interface ReportFiltersProps {
  onShow?: () => void;
  dateRange?: string;
  onDateRangeChange?: (val: string) => void;
  facility?: string;
  onFacilityChange?: (val: string) => void;
  facilityOptions?: FilterOption[];
  person?: string;
  onPersonChange?: (val: string) => void;
  personOptions?: FilterOption[];
  card?: string;
  onCardChange?: (val: string) => void;
  cardOptions?: FilterOption[];
  freez?: string;
  onFreezChange?: (val: string) => void;
  freezOptions?: FilterOption[];
  remaining?: string;
  onRemainingChange?: (val: string) => void;
  remainingOptions?: FilterOption[];
  children?: ReactNode;
}

export const ReportFilters = ({
  onShow,
  dateRange = "01/01/2026 - 12/31/2026",
  onDateRangeChange,
  facility = "",
  onFacilityChange,
  facilityOptions = [],
  person = "",
  onPersonChange,
  personOptions = [],
  card = "",
  onCardChange,
  cardOptions = [],
  freez = "",
  onFreezChange,
  freezOptions = [
    { value: "active", label: "Active" },
    { value: "frozen", label: "Frozen" },
    { value: "expired", label: "Expired" },
    { value: "cancelled", label: "Cancelled" },
  ],
  remaining = "",
  onRemainingChange,
  remainingOptions = [
    { value: "0", label: "Expired" },
    { value: "1-7", label: "1-7 days" },
    { value: "8-30", label: "8-30 days" },
    { value: "31+", label: "31+ days" },
  ],
}: ReportFiltersProps) => {
  return (
    <div className="grid grid-cols-7 gap-2 p-3 border border-gray-200 rounded-t-md items-end">
      <div>
        <label className="text-xs font-bold text-gray-500 block mb-1">Date</label>
        <input
          type="text"
          className="w-full border p-2 rounded text-sm"
          placeholder="01/01/2026 - 12/31/2026"
          value={dateRange}
          onChange={(e) => onDateRangeChange?.(e.target.value)}
        />
      </div>
      {[
        { label: "Facility", value: facility, onChange: onFacilityChange, options: facilityOptions },
        { label: "Person", value: person, onChange: onPersonChange, options: personOptions },
        { label: "Card", value: card, onChange: onCardChange, options: cardOptions },
        { label: "Freez", value: freez, onChange: onFreezChange, options: freezOptions },
        { label: "Remaining", value: remaining, onChange: onRemainingChange, options: remainingOptions },
      ].map(({ label, value, onChange, options }) => (
        <div key={label}>
          <label className="text-xs font-bold text-gray-500 block mb-1">{label}</label>
          <select
            className="w-full border p-2 rounded text-sm"
            value={value}
            onChange={(e) => onChange?.(e.target.value)}
          >
            <option value="">Select {label}</option>
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      ))}
      <button
        onClick={onShow}
        className="bg-blue-600 text-white px-4 py-2 rounded shadow hover:bg-blue-700"
      >
        Show
      </button>
    </div>
  );
};
