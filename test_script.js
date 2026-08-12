const totalOutput = 350;
const productionBonus = Math.min(0.02, (totalOutput / 500) * 0.0001);
const effectiveInflation = 0.02;
const infamyGdpPenalty = 0;
const annualGrowthRate = Math.max(-0.05, Math.min(0.05, productionBonus - effectiveInflation * 0.0005 - infamyGdpPenalty * 0.5));
const weeklyGrowthRate = annualGrowthRate / 52;
const expectedCompoundGrowth = Math.pow(1 + weeklyGrowthRate, 52);
console.log({
  productionBonus,
  annualGrowthRate,
  weeklyGrowthRate,
  expectedCompoundGrowth
});
