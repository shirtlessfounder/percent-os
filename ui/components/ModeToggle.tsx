'use client';

import { useState } from 'react';

export function ModeToggle() {
  const [isDark, setIsDark] = useState(true);

  const handleToggleClick = () => {
    setIsDark(!isDark);
  };

  const handleDarkClick = () => {
    setIsDark(true);
  };

  const handleLightClick = () => {
    setIsDark(false);
  };

  return (
    <div className="inline-flex flex-row items-center select-none">
      {/* Dark Label */}
      <h6
        className={`text-md uppercase px-6 py-3 min-w-[48px] cursor-pointer transition-colors duration-200 flex items-center gap-2.5 ${
          isDark
            ? 'text-[#FFFFFF] pointer-events-none'
            : 'text-[#5B5E62] hover:text-[#404346] active:text-[#010101]'
        }`}
        onClick={handleDarkClick}
        style={{ fontFamily: 'IBM Plex Mono, monospace' }}
      >
        PASS TOKEN
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 20 20" strokeWidth="1.5">
          <circle cx="10" cy="10" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 10l2 2 4-4" />
        </svg>
      </h6>

      {/* Toggle Switch */}
      <button
        onClick={handleToggleClick}
        className="relative w-[72px] h-[42px] border-none outline-none overflow-hidden rounded-[21px] transition-all duration-200"
        style={{
          background: isDark ? '#F8F8F8' : '#404346',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = isDark ? '#FCFEFE' : '#2D2F31';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = isDark ? '#F8F8F8' : '#404346';
        }}
        onMouseDown={(e) => {
          e.currentTarget.style.background = isDark ? '#E8E8E8' : '#141516';
        }}
        onMouseUp={(e) => {
          e.currentTarget.style.background = isDark ? '#FCFEFE' : '#2D2F31';
        }}
      >
        {/* Circle */}
        <div
          className="absolute w-[30px] h-[30px] rounded-[18px] transition-all duration-200"
          style={{
            top: '6px',
            left: isDark ? '6px' : '36px',
            background: isDark ? '#2D2F31' : '#DCE0E3',
          }}
        />

        {/* Decorative Element (after pseudo) */}
        <div
          className="absolute rounded-full transition-all duration-200"
          style={
            isDark
              ? {
                  top: '-3px',
                  right: '3px',
                  width: '48px',
                  height: '48px',
                  borderRadius: '24px',
                  background: '#F8F8F8',
                }
              : {
                  top: '21px',
                  right: '3px',
                  width: '1.5px',
                  height: '1.5px',
                  borderRadius: '0.75px',
                  background: '#404346',
                }
          }
        />
      </button>

      {/* Light Label */}
      <h6
        className={`text-md uppercase px-6 py-3 min-w-[48px] cursor-pointer transition-colors duration-200 flex items-center gap-2.5 ${
          isDark
            ? 'text-[#B9BDC1] hover:text-[#FCFEFE] active:text-[#CDD1D5]'
            : 'text-[#5B5E62] pointer-events-none'
        }`}
        onClick={handleLightClick}
        style={{ fontFamily: 'IBM Plex Mono, monospace' }}
      >
        FAIL TOKEN
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 20 20" strokeWidth="1.5">
          <circle cx="10" cy="10" r="8" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 7l6 6M13 7l-6 6" />
        </svg>
      </h6>
    </div>
  );
}
