interface BrandMarkProps {
  compact?: boolean;
}
export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <div className="brand-mark" role="img" aria-label="EraseGraph">
      <img src="/erasegraph-mark.svg" alt="" width="38" height="38" />
      {!compact && (
        <div>
          <strong>EraseGraph</strong>
          <span>Consent control plane</span>
        </div>
      )}
    </div>
  );
}
