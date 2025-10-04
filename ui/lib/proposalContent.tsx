import React from 'react';

interface ProposalContent {
  id: number;
  title: string;
  content: React.ReactNode;
}

export const proposalContentMap: Record<number, ProposalContent> = {
  0: {
    id: 0,
    title: "What is the price of $oogway after OOG-1 settles?",
    content: (
      <div className="space-y-4 text-gray-300">
        <p>
          Mint 5,000,000 $oogway, stake them in the $oogway vault and distribute staked tokens proportionally based on wallet volume to all traders of this decision market.
        </p>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">How is volume calculated?</h3>
          <p>
            All trading volume on the pass and fail markets occurring before the implied resolution on either the pass or fail markets is counted towards the reward calculation. Volume is calculated as if both pass and fail markets resolve.
          </p>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">What is implied resolution?</h3>
          <p>
            Implied resolution occurs once the pass-fail gap is sufficiently large such that no additional price movement can change the outcome of the market. This is an anti-manipulation feature.
          </p>
        </div>

        <p>
          The proposal passes if pass-fail gap &gt; 3%. Pass-fail gap is calculated using TWAP
        </p>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">I need help - who can I talk to?</h3>
          <p>
            Come join our telegram: <a href="https://t.me/oogwayexperimentportal" className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">https://t.me/oogwayexperimentportal</a>
          </p>
        </div>
      </div>
    )
  },
  6: {
    id: 6,
    title: "What is the price of $oogway after OOG-1 settles?",
    content: (
      <div className="space-y-4 text-gray-300">
        <p>
          Mint 5,000,000 $oogway, stake them in the $oogway vault and distribute staked tokens proportionally based on wallet volume to all traders of this decision market.
        </p>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">How is volume calculated?</h3>
          <p>
            All trading volume on the pass and fail markets occurring before the implied resolution on either the pass or fail markets is counted towards the reward calculation. Volume is calculated as if both pass and fail markets resolve.
          </p>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">What is implied resolution?</h3>
          <p>
            Implied resolution occurs once the pass-fail gap is sufficiently large such that no additional price movement can change the outcome of the market. This is an anti-manipulation feature.
          </p>
        </div>

        <p>
          The proposal passes if pass-fail gap &gt; 3%. Pass-fail gap is calculated using TWAP
        </p>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">I need help - who can I talk to?</h3>
          <p>
            Come join our telegram: <a href="https://t.me/oogwayexperimentportal" className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">https://t.me/oogwayexperimentportal</a>
          </p>
        </div>
      </div>
    )
  },
  7: {
    id: 7,
    title: "What will the price of $oogway be after the OOG-2 market resolves?",
    content: (
      <div className="space-y-4 text-gray-300">
        <p className="font-semibold">
          OOG-2: Create an $oogway-sOogway LP via meteora DAMM V2
        </p>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Mint</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>40,000,000 $oogway for the purpose of creating a liquid sOogway token</li>
            <li>10,000,000 $oogway to be distributed to traders of this market. distribution will be volume based and in the form of staked oogway</li>
          </ul>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Pros:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>$oogway stakers, who no longer want to signal commitment, can exit at a discount to $oogway.</li>
            <li>$oogway holders interested in signaling commitment, can purchase $oogway at discounts by purchasing staked $oogway</li>
            <li>decision markets can be set up on staked $oogway instead of $oogway</li>
            <li>removes deferred selling upon end of staking period</li>
            <li>increased volume on the native trading pool</li>
            <li>pricing of staked $oogway APY is more accurate</li>
          </ul>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">Cons:</h3>
          <ul className="list-disc list-inside space-y-1">
            <li>staking market becomes less restrictive</li>
            <li>complicated mechanisms increase overhead</li>
          </ul>
        </div>

        <p className="text-sm italic">
          Trading this decision market incurs financial risk.
        </p>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">How is volume calculated?</h3>
          <p>
            All trading volume on the pass and fail markets occurring before the implied resolution on either the pass or fail markets is counted towards the reward calculation. Volume is calculated as if both pass and fail markets resolve.
          </p>
        </div>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">What is implied resolution?</h3>
          <p>
            Implied resolution occurs once the pass-fail gap is sufficiently large such that no additional price movement can change the outcome of the market. This is an anti-manipulation feature.
          </p>
        </div>

        <p>
          The proposal passes if pass-fail gap &gt; 1%. Pass-fail gap is calculated using TWAP.
        </p>

        <div>
          <h3 className="text-lg font-semibold text-white mb-2">I need help - who can I talk to?</h3>
          <p>
            Come join our telegram: <a href="https://t.me/oogwayexperimentportal" className="text-blue-400 hover:text-blue-300 underline" target="_blank" rel="noopener noreferrer">https://t.me/oogwayexperimentportal</a>
          </p>
        </div>
      </div>
    )
  }
};

export function getProposalContent(proposalId: number, defaultDescription?: string) {
  const content = proposalContentMap[proposalId];

  if (content) {
    return {
      title: content.title,
      content: content.content
    };
  }

  // Fallback for proposals without custom content
  return {
    title: defaultDescription || `Proposal #${proposalId}`,
    content: null
  };
}
