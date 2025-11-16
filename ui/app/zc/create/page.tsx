'use client';

import { useState, useRef } from 'react';
import { usePrivyWallet } from '@/hooks/usePrivyWallet';
import { useWalletBalances } from '@/hooks/useWalletBalances';
import Header from '@/components/Header';
import EditableFlipCard from '@/components/EditableFlipCard';
import toast from 'react-hot-toast';

// Whitelisted wallets allowed to create proposals
const ALLOWED_WALLETS = [
  '79TLv4oneDA1tDUSNXBxNCnemzNmLToBHYXnfZWDQNeP'
];

export default function CreatePage() {
  const { ready, authenticated, user, walletAddress, login } = usePrivyWallet();
  const { sol: solBalance, zc: zcBalance } = useWalletBalances(walletAddress);
  const hasWalletBalance = solBalance > 0 || zcBalance > 0;

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [proposalLengthHours, setProposalLengthHours] = useState('24');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDescriptionFocused, setIsDescriptionFocused] = useState(false);

  // Refs for flip card inputs to manage auto-focus
  const firstDigitRef = useRef<HTMLInputElement>(null);
  const secondDigitRef = useRef<HTMLInputElement>(null);

  // Check if wallet has permission to create proposals
  const hasPermission = walletAddress ? ALLOWED_WALLETS.includes(walletAddress) : false;

  // Check if form is valid (title and description filled)
  const isFormInvalid = !title.trim() || !description.trim();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!title.trim()) {
      toast.error('Title is required');
      return;
    }
    if (!description.trim()) {
      toast.error('Description is required');
      return;
    }
    const hours = parseFloat(proposalLengthHours);
    if (!hours || hours <= 0) {
      toast.error('Proposal length must be a positive number');
      return;
    }

    setIsSubmitting(true);
    const toastId = toast.loading('Creating Decision Market...');

    try {
      // Convert hours to seconds
      const proposalLength = Math.floor(hours * 3600);

      // Simple request - backend handles everything else
      const requestBody = {
        title: title.trim(),
        description: description.trim(),
        proposalLength
      };

      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
      const API_KEY = process.env.NEXT_PUBLIC_API_KEY;

      if (!API_KEY) {
        toast.error('API key not configured', { id: toastId });
        setIsSubmitting(false);
        return;
      }

      const response = await fetch(`${API_URL}/api/proposals?moderatorId=1`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-API-KEY': API_KEY
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || error.error || 'Failed to create DM');
      }

      const data = await response.json();

      toast.success(
        `Proposal #${data.id} created successfully!`,
        { id: toastId }
      );

      // Reset form
      setTitle('');
      setDescription('');
      setProposalLengthHours('24');

    } catch (error) {
      console.error('Create DM failed:', error);
      toast.error(
        `Failed to create DM: ${error instanceof Error ? error.message : 'Unknown error'}`,
        { id: toastId }
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex h-screen" style={{ backgroundColor: '#0a0a0a' }}>
      <div className="flex-1 flex flex-col">
        <Header
          walletAddress={walletAddress}
          authenticated={authenticated}
          solBalance={solBalance}
          zcBalance={zcBalance}
          hasWalletBalance={hasWalletBalance}
          login={login}
          isPassMode={true}
        />

        {/* Content Area */}
        <div className="flex-1 flex overflow-hidden">
          <div className="flex-1 flex justify-center overflow-y-auto">
            <div className="w-full max-w-[1332px] 2xl:max-w-[1512px] pt-8 pb-8 px-4 md:px-0">
              <div className="mb-6">
                <h2 className="text-2xl font-medium" style={{ color: '#E9E9E3' }}>
                  Create Decision Market
                </h2>
              </div>

              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {/* Left Column (3/5 width) */}
                  <div className="md:col-span-3 flex flex-col gap-4">
                    {/* Title Card */}
                    <div className="bg-[#121212] border border-[#191919] rounded-[9px] py-4 px-5">
                      <span className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase mb-4 block" style={{ color: '#DDDDD7' }}>
                        Title
                      </span>
                      <input
                        id="title"
                        type="text"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        placeholder="UI Redesign by Zhirtless"
                        className="w-full h-[56px] px-3 bg-[#2a2a2a] rounded-[6px] text-white placeholder-gray-600 focus:outline-none border border-[#191919] text-2xl font-ibm-plex-mono"
                        style={{
                          WebkitAppearance: 'none',
                          MozAppearance: 'textfield',
                          fontFamily: 'IBM Plex Mono, monospace',
                          letterSpacing: '0em'
                        }}
                        disabled={isSubmitting}
                      />
                    </div>

                    {/* Description Card */}
                    <div className="bg-[#121212] border border-[#191919] rounded-[9px] py-4 px-5 flex-1 flex flex-col relative">
                      <span className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase mb-4 block" style={{ color: '#DDDDD7' }}>
                        Description
                      </span>
                      <textarea
                        id="description"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onFocus={() => setIsDescriptionFocused(true)}
                        onBlur={() => setIsDescriptionFocused(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Tab' && !description.trim()) {
                            e.preventDefault();
                            setDescription('Should ZC merge PR #15? https://github.com/zcombinatorio/percent/pull/15');
                          }
                        }}
                        placeholder="Should ZC merge PR #15? https://github.com/zcombinatorio/percent/pull/15"
                        className="w-full flex-1 px-3 py-3 bg-[#2a2a2a] rounded-[6px] text-white placeholder-gray-600 focus:outline-none border border-[#191919] text-2xl font-ibm-plex-mono resize-none"
                        style={{
                          WebkitAppearance: 'none',
                          fontFamily: 'IBM Plex Mono, monospace',
                          letterSpacing: '0em'
                        }}
                        disabled={isSubmitting}
                      />
                      {isDescriptionFocused && !description.trim() && (
                        <span className="absolute bottom-6 right-7 text-sm pointer-events-none" style={{ color: '#6B6E71', fontFamily: 'IBM Plex Mono, monospace' }}>
                          Press [TAB] to fill
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Right Column (2/5 width) */}
                  <div className="md:col-span-2 flex flex-col gap-4">
                    {/* Proposal Length Card */}
                    <div className="bg-[#121212] border border-[#191919] rounded-[9px] py-4 px-5">
                      <span className="text-sm font-semibold font-ibm-plex-mono tracking-[0.2em] uppercase mb-4 block text-center" style={{ color: '#DDDDD7' }}>
                        Duration
                      </span>

                      {/* Bordered Container for Flip Cards */}
                      <div className="border border-[#191919] rounded-[6px] py-6 px-4">
                        {/* Massive Flip Cards */}
                        <div className="flex items-center justify-center gap-4">
                          <EditableFlipCard
                            ref={firstDigitRef}
                            digit={proposalLengthHours.padStart(2, '0')[0]}
                            onChange={(val) => {
                              const ones = proposalLengthHours.padStart(2, '0')[1];
                              const newHours = parseInt(val + ones) || 0;
                              setProposalLengthHours(newHours.toString());
                            }}
                            onValueEntered={() => {
                              // Auto-focus and select second digit for immediate editing
                              if (secondDigitRef.current) {
                                secondDigitRef.current.focus();
                                secondDigitRef.current.select();
                              }
                            }}
                            disabled={isSubmitting}
                          />
                          <EditableFlipCard
                            ref={secondDigitRef}
                            digit={proposalLengthHours.padStart(2, '0')[1]}
                            onChange={(val) => {
                              const tens = proposalLengthHours.padStart(2, '0')[0];
                              const newHours = parseInt(tens + val) || 0;
                              setProposalLengthHours(newHours.toString());
                            }}
                            disabled={isSubmitting}
                          />
                        </div>

                        <p className="text-sm text-center mt-4" style={{ color: '#6B6E71', fontFamily: 'IBM Plex Mono, monospace' }}>
                          Click and type to edit hours.
                        </p>
                      </div>
                    </div>

                    {/* Submit Button Card */}
                    <div className="bg-[#121212] border border-[#191919] rounded-[9px] py-4 px-5">
                      {/* Bordered Container for Button */}
                      <div className="border border-[#191919] rounded-[6px] py-6 px-4">
                        <button
                          type="submit"
                          disabled={!hasPermission || isSubmitting || isFormInvalid}
                          className={`w-full h-[56px] rounded-full font-semibold transition flex items-center justify-center gap-1 uppercase font-ibm-plex-mono ${
                            !hasPermission || isSubmitting || isFormInvalid
                              ? 'bg-[#414346] cursor-not-allowed text-[#181818]'
                              : 'bg-[#DDDDD7] text-[#161616] cursor-pointer'
                          }`}
                        >
                          {!hasPermission
                            ? 'NO PERMISSION'
                            : (isSubmitting ? 'Creating DM...' : 'Create DM')}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
