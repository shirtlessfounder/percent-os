import { formatNumber, formatCurrency } from '@/lib/formatters';

interface UserBalancesBoxProps {
  passZC: number; // in lamports
  passSol: number; // in lamports
  failZC: number; // in lamports
  failSol: number; // in lamports
  zcPrice: number | null;
  solPrice: number | null;
  baseDecimals: number; // Required - token decimals for base token
  tokenSymbol?: string; // Display symbol for the base token
}

export function UserBalancesBox({ passZC, passSol, failZC, failSol, zcPrice, solPrice, baseDecimals, tokenSymbol = 'ZC' }: UserBalancesBoxProps) {
  const baseMultiplier = Math.pow(10, baseDecimals);
  return (
    <div className="bg-theme-card border border-theme-border rounded-[9px] py-3 px-5 hover:border-theme-border-hover transition-all duration-300">
      <div className="text-theme-text flex flex-col gap-3">
        <span className="text-xs text-theme-text-secondary">Conditional Token Balances</span>

        {/* Pass Market Balances */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-emerald-400">If Pass</span>
          <div className="flex items-center gap-2 text-sm">
            <span
              className="group relative cursor-default"
              title={zcPrice ? formatCurrency((passZC / baseMultiplier) * zcPrice, 2) : 'Price unavailable'}
            >
              {formatNumber(passZC / baseMultiplier, 0)} ${tokenSymbol}
              {zcPrice && (
                <span className="absolute left-0 top-full mt-1 px-2 py-1 bg-theme-input border border-theme-border-divider rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {formatCurrency((passZC / baseMultiplier) * zcPrice, 2)}
                </span>
              )}
            </span>
            <span className="text-theme-text-tertiary">|</span>
            <div className="flex items-center gap-1 group relative cursor-default" title={solPrice ? formatCurrency((passSol / 1e9) * solPrice, 2) : 'Price unavailable'}>
              <span>{formatNumber(passSol / 1e9, 6)}</span>
              <svg className="h-3 w-3" viewBox="0 0 101 88" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M100.48 69.3817L83.8068 86.8015C83.4444 87.1799 83.0058 87.4816 82.5185 87.6878C82.0312 87.894 81.5055 88.0003 80.9743 88H1.93563C1.55849 88 1.18957 87.8926 0.874202 87.6912C0.558829 87.4897 0.31074 87.2029 0.160416 86.8659C0.0100923 86.529 -0.0359181 86.1566 0.0280382 85.7945C0.0919944 85.4324 0.263131 85.0964 0.520422 84.8278L17.2061 67.408C17.5676 67.0306 18.0047 66.7295 18.4904 66.5234C18.9762 66.3172 19.5002 66.2104 20.0301 66.2095H99.0644C99.4415 66.2095 99.8104 66.3169 100.126 66.5183C100.441 66.7198 100.689 67.0065 100.84 67.3435C100.99 67.6804 101.036 68.0529 100.972 68.415C100.908 68.7771 100.737 69.1131 100.48 69.3817ZM83.8068 36.3032C83.4444 35.9248 83.0058 35.6231 82.5185 35.4169C82.0312 35.2108 81.5055 35.1045 80.9743 35.1048H1.93563C1.55849 35.1048 1.18957 35.2121 0.874202 35.4136C0.558829 35.6151 0.31074 35.9019 0.160416 36.2388C0.0100923 36.5758 -0.0359181 36.9482 0.0280382 37.3103C0.0919944 37.6723 0.263131 38.0083 0.520422 38.277L17.2061 55.6968C17.5676 56.0742 18.0047 56.3752 18.4904 56.5814C18.9762 56.7875 19.5002 56.8944 20.0301 56.8952H99.0644C99.4415 56.8952 99.8104 56.7879 100.126 56.5864C100.441 56.3849 100.689 56.0981 100.84 55.7612C100.99 55.4242 101.036 55.0518 100.972 54.6897C100.908 54.3277 100.737 53.9917 100.48 53.723L83.8068 36.3032ZM1.93563 21.7905H80.9743C81.5055 21.7898 82.0312 21.6835 82.5185 21.4773C83.0058 21.2712 83.4444 20.9695 83.8068 20.5911L100.48 3.17133C100.737 2.90265 100.908 2.56667 100.972 2.2046C101.036 1.84253 100.99 1.47008 100.84 1.13314C100.689 0.796193 100.441 0.509443 100.126 0.307961C99.8104 0.106479 99.4415 -0.000854492 99.0644 -0.000854492H20.0301C19.5002 -0.00013126 18.9762 0.106791 18.4904 0.312929C18.0047 0.519068 17.5676 0.820087 17.2061 1.19754L0.524723 18.6173C0.267481 18.8859 0.0963642 19.2219 0.0323936 19.584C-0.0315771 19.946 0.0144792 20.3184 0.164862 20.6554C0.315245 20.9923 0.563347 21.2791 0.878727 21.4806C1.19411 21.682 1.56303 21.7894 1.94013 21.7896L1.93563 21.7905Z" fill="#AFAFAF"/>
              </svg>
              {solPrice && (
                <span className="absolute right-0 top-full mt-1 px-2 py-1 bg-theme-input border border-theme-border-divider rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {formatCurrency((passSol / 1e9) * solPrice, 2)}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Fail Market Balances */}
        <div className="flex flex-col gap-1">
          <span className="text-xs font-semibold text-rose-400">If Fail</span>
          <div className="flex items-center gap-2 text-sm">
            <span
              className="group relative cursor-default"
              title={zcPrice ? formatCurrency((failZC / baseMultiplier) * zcPrice, 2) : 'Price unavailable'}
            >
              {formatNumber(failZC / baseMultiplier, 0)} ${tokenSymbol}
              {zcPrice && (
                <span className="absolute left-0 top-full mt-1 px-2 py-1 bg-theme-input border border-theme-border-divider rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {formatCurrency((failZC / baseMultiplier) * zcPrice, 2)}
                </span>
              )}
            </span>
            <span className="text-theme-text-tertiary">|</span>
            <div className="flex items-center gap-1 group relative cursor-default" title={solPrice ? formatCurrency((failSol / 1e9) * solPrice, 2) : 'Price unavailable'}>
              <span>{formatNumber(failSol / 1e9, 6)}</span>
              <svg className="h-3 w-3" viewBox="0 0 101 88" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M100.48 69.3817L83.8068 86.8015C83.4444 87.1799 83.0058 87.4816 82.5185 87.6878C82.0312 87.894 81.5055 88.0003 80.9743 88H1.93563C1.55849 88 1.18957 87.8926 0.874202 87.6912C0.558829 87.4897 0.31074 87.2029 0.160416 86.8659C0.0100923 86.529 -0.0359181 86.1566 0.0280382 85.7945C0.0919944 85.4324 0.263131 85.0964 0.520422 84.8278L17.2061 67.408C17.5676 67.0306 18.0047 66.7295 18.4904 66.5234C18.9762 66.3172 19.5002 66.2104 20.0301 66.2095H99.0644C99.4415 66.2095 99.8104 66.3169 100.126 66.5183C100.441 66.7198 100.689 67.0065 100.84 67.3435C100.99 67.6804 101.036 68.0529 100.972 68.415C100.908 68.7771 100.737 69.1131 100.48 69.3817ZM83.8068 36.3032C83.4444 35.9248 83.0058 35.6231 82.5185 35.4169C82.0312 35.2108 81.5055 35.1045 80.9743 35.1048H1.93563C1.55849 35.1048 1.18957 35.2121 0.874202 35.4136C0.558829 35.6151 0.31074 35.9019 0.160416 36.2388C0.0100923 36.5758 -0.0359181 36.9482 0.0280382 37.3103C0.0919944 37.6723 0.263131 38.0083 0.520422 38.277L17.2061 55.6968C17.5676 56.0742 18.0047 56.3752 18.4904 56.5814C18.9762 56.7875 19.5002 56.8944 20.0301 56.8952H99.0644C99.4415 56.8952 99.8104 56.7879 100.126 56.5864C100.441 56.3849 100.689 56.0981 100.84 55.7612C100.99 55.4242 101.036 55.0518 100.972 54.6897C100.908 54.3277 100.737 53.9917 100.48 53.723L83.8068 36.3032ZM1.93563 21.7905H80.9743C81.5055 21.7898 82.0312 21.6835 82.5185 21.4773C83.0058 21.2712 83.4444 20.9695 83.8068 20.5911L100.48 3.17133C100.737 2.90265 100.908 2.56667 100.972 2.2046C101.036 1.84253 100.99 1.47008 100.84 1.13314C100.689 0.796193 100.441 0.509443 100.126 0.307961C99.8104 0.106479 99.4415 -0.000854492 99.0644 -0.000854492H20.0301C19.5002 -0.00013126 18.9762 0.106791 18.4904 0.312929C18.0047 0.519068 17.5676 0.820087 17.2061 1.19754L0.524723 18.6173C0.267481 18.8859 0.0963642 19.2219 0.0323936 19.584C-0.0315771 19.946 0.0144792 20.3184 0.164862 20.6554C0.315245 20.9923 0.563347 21.2791 0.878727 21.4806C1.19411 21.682 1.56303 21.7894 1.94013 21.7896L1.93563 21.7905Z" fill="#AFAFAF"/>
              </svg>
              {solPrice && (
                <span className="absolute right-0 top-full mt-1 px-2 py-1 bg-theme-input border border-theme-border-divider rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                  {formatCurrency((failSol / 1e9) * solPrice, 2)}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
