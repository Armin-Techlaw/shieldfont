type PairWords = {
  human: string;
  system: string;
};

function normalizedWord(value: string): string {
  return value.trim().toLocaleLowerCase("en");
}

export function describePairConflicts(human: string, system: string, pairs: PairWords[]): string | null {
  const conflicts = [normalizedWord(human), normalizedWord(system)].flatMap((word) => {
    const owner = pairs.find((pair) => {
      const left = normalizedWord(pair.human);
      const right = normalizedWord(pair.system);
      return left === word || right === word;
    });
    if (!owner) return [];

    const left = normalizedWord(owner.human);
    const right = normalizedWord(owner.system);
    const partner = left === word ? right : left;
    return [`“${word}” is already paired with “${partner}”`];
  });

  return conflicts.length ? `${conflicts.join("; ")}.` : null;
}
