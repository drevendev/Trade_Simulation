MARKETS, TRADE AND FX CONTRACTS — Economic Simulation

Status: implementation-grade subsystem contract v1. Authoritative together with CORE\_SCHEMA\_AND\_LIFECYCLES. This document converts the mature MARKETS\_AND\_TRADE and MONETARY\_AND\_CURRENCY designs into exact runtime interfaces for local clearing, interregional trade, shipment ownership, currency conversion and transaction reconciliation. It does not redefine the 16-phase tick order, fiscal policy formation or monetary-policy rules.

1\. Implementation objective

The implementation must preserve the useful simplicity of the existing repository while replacing its implicit trader/deal balance sheet with explicit actors, inventories, shipments and ledgers. The current Market already demonstrates the right high-level pattern: a local persistent price stock plus per-turn demand/supply/traded counters and bounded repricing. Current City.ClearLocalMarket demonstrates deterministic proportional rationing. Current Deal, however, combines arbitrage choice, trader cash, transport capacity/loss and goods movement in one object. Core v1 separates those responsibilities into MarketIntent \-\> MarketAllocation \-\> TradePlan \-\> FxSettlement \-\> TradeShipment \+ transaction records.

Non-goals for this spec: order books, auctions with strategic bids, market-maker agents, trader occupations, warehouses owned by markets, multi-hop route optimization, FX speculation, credit, letters of credit, insurance, futures, black-market FX, endogenous merchant markups, individual retail shops.

2\. Canonical price meaning

LocalMarketState.priceByGood\[g\] is the NET SELLER UNIT PRICE in Region.settlementCurrencyId.

It is not tax-inclusive and it is not a cross-currency world price.

For buyer b in region r:

sellerNetUnitPrice \= market.priceByGood\[g\]  
destinationStateId \= r.controllerStateId from Phase-1 effective jurisdiction  
statutoryConsumptionTaxRate \= destinationStateId \== null ? 0 : taxPolicy.getConsumptionTaxRate(destinationStateId, goodCategory(g))  
collectionEfficiency \= destinationStateId \== null ? 0 : taxPolicy.getCollectionEfficiency(destinationStateId)  
assessedTaxPerUnit \= sellerNetUnitPrice × statutoryConsumptionTaxRate  
collectedTaxPerUnit \= assessedTaxPerUnit × collectionEfficiency  
buyerGrossUnitPrice \= sellerNetUnitPrice \+ collectedTaxPerUnit

Tax-policy integration boundary: market pricing/clearing consumes only the two side-effect-free reads above. The market subsystem never owns or mutates fiscal policy. Before the full Fiscal/Laws subsystem becomes active in M6, M3 tests and deterministic local-market fixtures must inject an immutable taxPolicy provider with explicit finite rates and collectionEfficiency in \[0,1\]. Those fixture values are test/scenario inputs, not new canonical defaults. When M6 is implemented, the same reads are backed by Phase-1 effective FiscalPolicyState without changing market settlement.

Affordability always uses buyerGrossUnitPrice. Seller revenue uses sellerNetUnitPrice. Only collectedTaxPerUnit is debited from the buyer and transferred to the effective destination State treasury with the sale. assessedTaxPerUnit \- collectedTaxPerUnit is telemetry only, remains with the buyer, and creates no arrears asset in core v1.

State self-procurement is exempt/netted from consumption tax by default. Export shipment invoice value is not charged source consumption tax. If the destination buyer is a final household consumer, destination consumption tax may apply to the import purchase in addition to tariff.

CPI/read-model code must use household-facing tax-inclusive prices, not raw sellerNetUnitPrice.

3\. Required additive type aliases

type MarketIntentId \= string;      // mi:...  
type MarketAllocationId \= string;  // ma:...  
type TradePlanId \= string;         // tp:...  
type FxPairId \= string;            // fxp:...  
type FxSettlementId \= string;      // fxs:...  
type TransactionId \= string;       // tx:...  
type TransactionBundleId \= string; // tb:...

All IDs are deterministic. Do not use random UUIDs during simulation.

EconomicTransaction from CORE\_SCHEMA is additively extended with:

transactionId: TransactionId  
bundleId?: TransactionBundleId  
originatingTransactionId?: TransactionId  
fxSettlementId?: FxSettlementId

These fields are required for tax linkage, FX reconciliation and causal explainability. Existing source/destination ActorRef fields remain unchanged.

4\. Market expectation persistent state

MarketExpectationState minimum fields:

interface MarketExpectationState {  
  observationCount: number;          // integer \>= 0; informative MAIN clearings only  
  expectedUseEma: number;  
  shortageEma: number;  
  surplusEma: number;  
  lastEffectiveDemand: number;  
  lastOfferedQuantity: number;  
  lastClearedQuantity: number;  
}

All fields are finite and non-negative; observationCount is an integer. Expectations are weak lagged signals, not inventories or forecasts, and cannot be sold or consumed. At LocalMarket genesis every market/good starts with observationCount \= 0 and every EMA/last-observation field \= 0\. Zero is a valid economic observation, so observationCount—not expectedUseEma \== 0—is the bootstrap marker.

## 5\. Ephemeral MarketIntent contract

M3 registry slice note: REQ-MARKET-001 requires this section together with section 6, Budget commitment rule. The MarketIntent shape/validation and the budget-ledger/planning-envelope rule are one executable M3 unit; section 6 is not optional background.

interface MarketIntent {  
  id: MarketIntentId;  
  actor: ActorRef;  
  regionId: RegionId;  
  goodId: GoodId;  
  side: 'BUY' | 'SELL';  
  purpose: 'CONSUMPTION' | 'INPUT' | 'INVESTMENT' | 'PUBLIC\_PROCUREMENT' | 'INVENTORY\_REBALANCE';  
  desiredQuantity: number;  
  maxSpend?: number;                // BUY only, in region settlement currency  
  minimumReserveQuantity?: number;  // SELL only  
  priorityClass?: string;  
  sourcePlanId: string;  
  inventoryBucket?: 'GENERAL' | 'INPUT' | 'OUTPUT' | 'INVESTMENT';  
}

Validation:  
\- desiredQuantity \>= 0 and finite;  
\- BUY requires maxSpend \>= 0;  
\- SELL requires minimumReserveQuantity \>= 0, default 0;  
\- intent actor must own the relevant wallet/inventory;  
\- inventoryBucket resolves the exact physical endpoint. ProductionUnit BUY/INPUT requires INPUT, BUY/INVESTMENT requires INVESTMENT, and normal output SELL requires OUTPUT. Other actors use GENERAL unless their canonical schema explicitly defines another bucket. Settlement must never guess a ProductionUnit inventory from actor type alone;  
\- intent region must match the market pass in which it participates;  
\- a dormant market accepts no ordinary intents;  
\- planners must budget BUY intents before submission; a market engine never assumes future sales will finance current planned purchases.

No limit-price field exists in core v1. Bounded price adjustment plus explicit budget and quantity intentions are the market mechanism.

## 6\. Budget commitment rule

TickContext must maintain an ephemeral budget ledger keyed by actor \+ currency \+ planning envelope. Planners are responsible for ensuring that the sum of maxSpend commitments they submit from a given envelope does not exceed the cash allocated to that envelope.

Required principle: sale proceeds realized later in the same market phase do not create new unplanned demand. This removes resource-order dependence present in the prototype and makes replay stable. Gross wages settled in Phase 5 are an explicit exception because CORE\_SCHEMA already declares them available for Phase-8 household purchases.

A rejected/partially filled intent releases its unused commitment for later passes only when the planner explicitly designated the envelope as reusable. Phase-7 import allocations reduce the corresponding Phase-8 residual demand/budget so the same planned need cannot be bought twice.

7\. Seller availability and buyer effective demand

For SELL intent i:

endpoint\_i \= physicalInventoryEndpoint(i.actor, i.goodId, i.inventoryBucket)  
owned \= inventoryOf(endpoint\_i)  
endpointReserve \= max(s.minimumReserveQuantity ?? 0 for SELL intent s where physicalInventoryEndpoint(s.actor, s.goodId, s.inventoryBucket) \== endpoint\_i)  
alreadyCommitted \= commitmentLedger.soldOrReserved(endpoint\_i)  
sellable\_i \= min(i.desiredQuantity, max(0, owned \- endpointReserve \- alreadyCommitted))

physicalInventoryEndpoint is keyed by persistent ActorRef identity \+ goodId \+ normalized inventoryBucket. ProductionUnit resolves INPUT / OUTPUT / INVESTMENT exactly from the intent; actors with one canonical goods inventory use GENERAL. Multiple SELL intents that resolve to the same endpoint share one commitment balance. minimumReserveQuantity is a floor on that shared physical endpoint, not a per-intent private reservation: when same-endpoint SELL intents declare different reserves, compute endpointReserve once as the maximum declared reserve before any commitment is consumed. A lower-reserve intent may not sell stock protected by a higher-reserve intent on the same endpoint. Distinct endpoints, including distinct ProductionUnit buckets for the same good, do not consume one another's commitments. When seller availability callbacks update this ledger, evaluate seller intents in stable persistent-actor-ID then intent-ID order before proportional clearing. This ordering makes availability computation deterministic; it does not replace the Section-10 proportional allocation.

For BUY intent j at local market net price p:

gross\_j \= grossUnitPriceForBuyer(j.actor, j.regionId, g, j.purpose, p)  
effectiveDemand\_j \= min(j.desiredQuantity, maxSpend\_j / max(gross\_j, moneyEpsilon))

Zero or negative price is invalid except explicit free-scenario fixtures. Default production goods use positive configured price floors.

8\. Phase-4 pre-production procurement

Phase 4 is a local procurement pass for ProductionUnit and eligible State input demand.

Rules:  
\- use Phase-1/prior-close market price; do not update price here;  
\- use only inventory physically available in the region before this pass;  
\- shipments created later in Phase 7 cannot feed current Phase-5 production;  
\- shipments from earlier ticks whose arrivalTick \== current tick are delivered in Phase 1 and therefore may participate;  
\- clearing is deterministic and proportional using the same allocation primitive as Phase 8;  
\- tax treatment is known before affordability;  
\- unused unmet input demand is recorded, not carried as a hidden order book.  
Phase-4 carried-output clarification (M4): pre-existing ProductionUnit OUTPUT may supply PRE\_PRODUCTION INPUT demand; same-tick Phase-5 output may not. ACTIVE uses the Section-17 output reserve; CLOSING uses zero reserve.

## 9\. Phase-6 price formation

For active market m and good g, aggregate market-facing intentions after Phase-5 production:

D \= Σ effectiveDemand\_j  
S \= Σ sellable\_i  
V \= max(D \+ S, quantityEpsilon)  
excess \= clamp((D \- S) / V, \-1, 1\)

marketFacingStock \= Σ inventory explicitly offered/available above reserves  
expectedUse \= expectation.observationCount \== 0  
  ? max(D, quantityEpsilon)  
  : max(expectation.expectedUseEma, quantityEpsilon)  
inventoryCoverage \= marketFacingStock / expectedUse  
targetCoverage \= SimulationConfig.markets.targetInventoryCoverageTicks  
inventoryGap \= clamp((targetCoverage \- inventoryCoverage) / max(targetCoverage, quantityEpsilon), \-1, 1\)

pressure \= wExcess × excess \+ wInventory × inventoryGap  
logChange \= clamp(priceSpeed × pressure, \-maxLogPriceStep, \+maxLogPriceStep)  
price\_nextPass \= clamp(price\_old × exp(logChange), minPrice\[g\], maxPrice\[g\])

Canonical configuration binding:  
wExcess \= SimulationConfig.markets.shortageSignalWeight  
wInventory \= SimulationConfig.markets.inventorySignalWeight  
priceSpeed \= SimulationConfig.markets.basePriceAdjustmentSpeed  
maxLogPriceStep \= SimulationConfig.markets.maxAbsoluteLogPriceMovePerTick

CANONICAL\_CONFIG\_AND\_WORLD\_GENERATION section 4 is the sole owner of baseline numeric values for these fields, including expectationAlpha and targetInventoryCoverageTicks. This contract owns the Phase-6 formula and must not publish a competing default set.

Expectation update occurs exactly once after Phase-8 MAIN local clearing, never after the Phase-4 pre-production pass. Let effectiveDemandQuantity, offeredQuantity and clearedQuantity be the realized MAIN-pass aggregates for this market/good. If both effectiveDemandQuantity \<= quantityEpsilon and offeredQuantity \<= quantityEpsilon, the pass contains no market information: leave MarketExpectationState unchanged. Otherwise compute:

observedUse \= effectiveDemandQuantity  
unmet \= max(0, effectiveDemandQuantity \- clearedQuantity)  
unsold \= max(0, offeredQuantity \- clearedQuantity)  
shortageRate \= effectiveDemandQuantity \> quantityEpsilon ? unmet / effectiveDemandQuantity : 0  
surplusRate \= offeredQuantity \> quantityEpsilon ? unsold / offeredQuantity : 0  
alpha \= SimulationConfig.markets.expectationAlpha

If observationCount \== 0, initialize expectedUseEma \= observedUse, shortageEma \= shortageRate and surplusEma \= surplusRate directly. Otherwise update each as alpha × observation \+ (1 \- alpha) × previous EMA. Then set lastEffectiveDemand \= effectiveDemandQuantity, lastOfferedQuantity \= offeredQuantity, lastClearedQuantity \= clearedQuantity and increment observationCount by 1\.

Using effective demand rather than cleared quantity for expectedUse prevents rationing from teaching the market that budget-backed unmet use disappeared. Phase-6 may use current D only while observationCount \== 0; after the first informative MAIN observation it always uses the lagged expectedUseEma. These EMAs do not add trend extrapolation, speculative demand or a second price target.

If D and S are both approximately zero, price stays unchanged. Missing trades do not imply zero price. Dormant markets do not reprice.

Price updates exactly once per tick in Phase 6\. Phase 7 trade and Phase 8 clearing use the resulting Phase-6 price.

## 10\. Deterministic local clearing primitive

M3 registry slice note: REQ-MARKET-003 requires sections 7, 10 and 11 together. Section 7 defines the canonical sellable\_i/effectiveDemand\_j inputs, this section defines deterministic proportional allocation/matching, and section 11 defines the MarketAllocation output schema. This is a navigation boundary only; none of the three rules is duplicated or overridden here.

For one region \+ good \+ pass:

Q \= min(Σ sellable\_i, Σ effectiveDemand\_j)

Provisional seller allocation:  
sellerFill\_i \= Q × sellable\_i / Σ sellable

Provisional buyer allocation:  
buyerFill\_j \= Q × effectiveDemand\_j / Σ effectiveDemand

Use stable residual correction so floating error does not create/destroy quantity. Correction order is persistent actor ID then intent ID. Never use registry insertion order.

Concrete counterparties are produced with a two-pointer matcher over seller allocations and buyer allocations sorted by stable keys. Complexity is O(B \+ S) after sorting/ordered collection, not O(B×S).

Each matched lot q produces one atomic transaction bundle:  
1\) seller inventory\[g\] \-= q;  
2\) buyer inventory\[g\] \+= q;  
3\) buyer wallet\[marketCurrency\] \-= q × grossBuyerUnitPrice;  
4\) seller wallet\[marketCurrency\] \+= q × sellerNetUnitPrice;  
5\) destination State treasury \+= collected consumption tax, if any;  
6\) ledger records MARKET\_SALE and optional CONSUMPTION\_TAX linked by bundleId.

No mutation is applied unless all debits and inventory removals pass preflight validation.

## 11\. Local MarketAllocation schema

interface MarketAllocation {  
  id: MarketAllocationId;  
  marketId: MarketId;  
  goodId: GoodId;  
  pass: 'PRE\_PRODUCTION' | 'MAIN';  
  sellerIntentId: MarketIntentId;  
  buyerIntentId: MarketIntentId;  
  seller: ActorRef;  
  buyer: ActorRef;  
  quantity: number;  
  sellerNetUnitPrice: number;  
  buyerGrossUnitPrice: number;  
  marketCurrencyId: CurrencyId;  
  consumptionTaxAmount: number;  
  destinationStateId: StateId | null;  
  sellerInventoryBucket: 'GENERAL' | 'INPUT' | 'OUTPUT' | 'INVESTMENT';  
  buyerInventoryBucket: 'GENERAL' | 'INPUT' | 'OUTPUT' | 'INVESTMENT';  
}

MarketAllocation is ephemeral. Persistent truth after execution is actor stock \+ transaction ledger \+ LocalMarket price/expectation state.

Inventory endpoint rule: local settlement debits sellerInventoryBucket and credits buyerInventoryBucket. For ProductionUnit, INPUT purchases enter inputInventory, INVESTMENT purchases enter investmentInventory, and normal output sales debit outputInventory. A settlement path that writes to an unspecified generic ProductionUnit inventory is invalid.

## 12\. Transaction schemas for local trade

MARKET\_SALE EconomicTransaction:  
\- transactionId, bundleId, tick, phase;  
\- type \= 'MARKET\_SALE';  
\- source \= buyer; destination \= seller;  
\- goodId, quantity;  
\- currencyId \= market settlement currency;  
\- unitPrice \= seller net unit price;  
\- moneyAmount \= seller net value;  
\- sourceRegionId \= destinationRegionId \= market region.

CONSUMPTION\_TAX EconomicTransaction:  
\- type \= 'CONSUMPTION\_TAX';  
\- source \= buyer; destination \= {type:'STATE', id: destinationStateId};  
\- currencyId \= market currency;  
\- moneyAmount \= collected tax;  
\- taxAmount \= collected tax;  
\- originatingTransactionId \= MARKET\_SALE transactionId;  
\- same bundleId.

AssessedTax and uncollectedTax may be telemetry fields/diagnostics but are not treasury inflows.

13\. Trade topology

Core v1 trade uses only configured directed TransportLinks. There is no all-pairs market and no within-tick pathfinding across arbitrary multi-hop routes.

A core-v1 TradeShipment has exactly one TransportLink in routeLinkIds. The array shape is retained for future compatibility.

A multi-hop economic path can emerge across successive ticks because an imported good can later be re-exported from the destination region. Direct multi-link routing is v1.5 unless benchmarks prove it necessary.

A link is eligible only if enabled and effective capacity \> epsilon.

GoodDefinition must expose:  
cargoWeightPerUnit: number \> 0

Effective capacity use:  
capacityUse(q,g) \= q × cargoWeightPerUnit\[g\]

effectiveLinkCapacity \= max(0, baseCapacity × clamp(condition,0,1) × externalInfrastructureCapacityFactor)

The infrastructure factor is derived by the infrastructure subsystem; this spec consumes it but does not own its formula.

14\. Transport fee contract

To prevent every shipment from requiring multiple currency conversions, core v1 adopts one invoice convention:

ALL transport fees for a directed shipment are invoiced in destination Region.settlementCurrencyId.

The configured fee receiver may hold that currency even if it is foreign to the receiver’s home region. It must later use ordinary FX rules before spending it in a market denominated in another currency.

TransportLink is additively extended with:

travelTicks: number;                 // integer \>= 0  
feeReceiver: ActorRef;               // normally State or ProductionUnit  
routinePhysicalLossRate?: number;    // \[0,1), default 0

baseTransportCost unit is destination-currency units per cargo-capacity unit for that directed link at condition=1.

transportFeeDest \= capacityUse × baseTransportCost × costConditionMultiplier  
costConditionMultiplier \= 1 / max(condition, minTransportConditionForCost)

Use explicit configured caps on costConditionMultiplier. If condition is below operational threshold, disable the link rather than permit infinite cost.

RoutinePhysicalLossRate defaults to zero. When enabled, loss is a real-goods destruction flow and never a fee. Event-driven shipment destruction is handled by EVENTS.

15\. Trade residual supply and demand

Phase 7 sees only quantities still economically available after Phase 4/6 preparation and before Phase 8 local clearing.

Source export supply per seller intent:  
exportable\_i \<= remaining sellable inventory above reserve and commitments.

Destination import demand per buyer intent:  
importDemand\_j \<= remaining planned demand not already satisfied in Phase 4 or otherwise committed.

The same unit of goods cannot be both reserved for export and offered to Phase-8 local buyers. The same buyer demand cannot be both allocated to import and local clearing.

16\. Trade candidate contract

interface TradeCandidate {  
  tradePlanId: TradePlanId;  
  linkId: TransportLinkId;  
  originRegionId: RegionId;  
  destinationRegionId: RegionId;  
  goodId: GoodId;  
  sourceCurrencyId: CurrencyId;  
  destinationCurrencyId: CurrencyId;  
  sourceSellerNetUnitPrice: number;  
  destinationReferenceNetUnitPrice: number;  
  estimatedTransportUnitCostDest: number;  
  estimatedTariffRate: number;  
  estimatedFxInputPerSourceCurrency: number;  
  shortageRateDestination: number;  
  score: number;  
}

Generate candidates only for positive source export supply, positive destination residual demand, enabled link capacity and legally permitted trade.

Domestic/international classification uses Phase-1 effective jurisdiction. A Phase-14 controller change cannot alter current-tick tariffs or border eligibility.

17\. FX pair canonical storage

There is exactly one FxLiquidityPoolState per active currency pair.

CORE\_SCHEMA currently nests fxPools under MonetaryAuthorityState. To avoid duplicated canonical state, the pool is stored only under the MonetaryAuthority that issues the pair’s explicitly configured baseCurrencyId. The quote-currency authority must not store a duplicate. Runtime may build a derived pairId \-\> owningAuthorityId index.

This is storage ownership only; the pool’s wallet is its own settlement stock and is not spendable MonetaryAuthority wallet cash.

interface FxLiquidityPoolState {  
  pairId: FxPairId;  
  baseCurrencyId: CurrencyId;  
  quoteCurrencyId: CurrencyId;  
  cash: Wallet; // exactly base \+ quote nonzero keys in normal operation  
  spotRateQuotePerBase: number;  
  targetBaseReserveShare: number;  
  flowPressureEma: number;  
  transactionSpread: number;  
  minOperationalReserveBase: number;  
  minOperationalReserveQuote: number;  
  maxRateMovePerTick: number;  
}

Pool quote convention is explicit. Never derive base/quote direction from lexical pairId order.

18\. FX quote convention and pure quote function

For pair A(base)/B(quote):  
e \= units of B per 1 unit of A.  
s \= transactionSpread, 0 \<= s \< 1\.

Base \-\> Quote:  
quoteOutput \= baseInput × e × (1 \- s)  
requiredBaseForDesiredQuote \= desiredQuote / (e × (1 \- s))

Quote \-\> Base:  
baseOutput \= quoteInput / (e × (1 \+ s))  
requiredQuoteForDesiredBase \= desiredBase × e × (1 \+ s)

The spread remains inside pool inventories; it never creates currency.

Pure API:

quoteFx(world, pairId, fromCurrencyId, toCurrencyId, desiredOutputAmount, reservationLedger?) \-\> FxQuote

FxQuote contains:  
\- pairId, direction;  
\- spotRate;  
\- spread;  
\- desiredOutputAmount;  
\- requiredInputAmountAtDesiredOutput;  
\- maxOutputByPoolReserve;  
\- maxOutputByProvidedInput if caller supplies input cap;  
\- feasibleOutputAmount;  
\- requiredInputForFeasibleOutput;  
\- reserveLimited boolean.

quoteFx mutates nothing.

19\. FX settlement primitive

All actual cross-currency conversion uses exactly one primitive:

settleFx(request, stateDeltaContext) \-\> FxSettlementReceipt

interface FxSettlementRequest {  
  settlementId: FxSettlementId;  
  payer: ActorRef;  
  recipient: ActorRef;  
  pairId: FxPairId;  
  inputCurrencyId: CurrencyId;  
  outputCurrencyId: CurrencyId;  
  desiredOutputAmount: number;  
  maxInputAmount: number;  
  purpose: 'TRADE\_GOODS' | 'FOREIGN\_BOND' | 'OWNER\_TRANSFER' | 'OTHER\_EXPLICIT\_PAYMENT';  
  originatingBundleId: TransactionBundleId;  
}

interface FxSettlementReceipt {  
  settlementId: FxSettlementId;  
  pairId: FxPairId;  
  inputCurrencyId: CurrencyId;  
  outputCurrencyId: CurrencyId;  
  inputAmount: number;  
  outputAmount: number;  
  desiredOutputAmount: number;  
  fillRatio: number;  
  spotRate: number;  
  spread: number;  
  reserveLimited: boolean;  
}

Settlement preconditions:  
\- payer has inputAmount cash;  
\- pool output reserve after settlement remains \>= configured floor;  
\- pool/input/output amounts finite and non-negative;  
\- currencies match pair;  
\- recipient accepts output currency for the originating contract.

Settlement mutation:  
payer.wallet\[input\] \-= inputAmount  
pool.cash\[input\] \+= inputAmount  
pool.cash\[output\] \-= outputAmount  
recipient.wallet\[output\] \+= outputAmount

No other currency changes. The conversion itself preserves M\_tx for each currency independently.

20\. FX ledger endpoint

ActorRef does not pretend that an FX pool is an economic actor. For reconciliation only, define:

type LedgerAccountRef \=  
  | { type:'ACTOR'; actor: ActorRef }  
  | { type:'FX\_POOL'; owningAuthorityId: MonetaryAuthorityId; pairId: FxPairId };

FX settlement emits two linked ledger legs under one FxSettlementId:  
\- FX\_INPUT: payer actor \-\> FX\_POOL in input currency;  
\- FX\_OUTPUT: FX\_POOL \-\> recipient actor in output currency.

This preserves CORE\_SCHEMA ActorRef semantics while making pool debits/credits traceable.

21\. Phase-7 FX reservation ledger

Phase 7 may evaluate several trade candidates against the same finite pool. Pure quote calls must not all assume the same unspent reserve.

TickContext therefore owns an ephemeral FxReservationLedger:  
reservedOutputByPairAndCurrency  
reservedInputByActorAndCurrency

Candidate allocation is processed in deterministic candidate order. Each accepted planned quantity reserves the needed pool output and buyer input cash before the next candidate is sized. Reservation is not a canonical money mutation and expires if the bundle is not committed.

Actual settleFx execution must reproduce or underfill the reservation; it may never exceed it.

This provides fair deterministic capacity accounting without an FX order book.

22\. FX pressure telemetry

For each pool and tick record desired flow before reserve rationing and filled flow after rationing.

For base currency A:  
desiredDemandForBase \= desired A output from pool  
desiredSupplyOfBase \= desired A input to pool  
filledDemandForBase \= actual A output  
filledSupplyOfBase \= actual A input

These feed MONETARY’s Phase-15 next-tick FX-rate rule. Current tick spot rate never moves during Phase-7 settlement.

23\. Cross-currency trade cost

Buyer payment currency is always destination Region.settlementCurrencyId.  
Seller invoice currency is always origin Region.settlementCurrencyId.

For dispatched quantity q:  
sourceInvoiceSrc \= q × sourceSellerNetUnitPrice

If currencies are equal:  
goodsPaymentDest \= sourceInvoiceSrc  
fxSettlement \= none

If currencies differ:  
goodsPaymentDest \= required destination-currency input from quoteFx to deliver sourceInvoiceSrc to seller.

For tariff base, use spot MID conversion without spread, then add transport:  
sourceInvoiceDestMid \= midConvert(sourceInvoiceSrc, sourceCurrency, destinationCurrency)  
customsValueDest \= sourceInvoiceDestMid \+ transportFeeDest  
tariffDest \= customsValueDest × applicableTariffRate × collectionEfficiency(destinationState)

If buyer/purpose is subject to destination consumption tax:  
consumptionTaxDest \= sourceInvoiceDestMid × applicableConsumptionTaxRate × collectionEfficiency(destinationState)  
else 0\.

buyerTotalDebitDest \= goodsPaymentDest \+ transportFeeDest \+ tariffDest \+ consumptionTaxDest

Tariff and consumption tax are never burned. Both settle to destination State treasury. Transport fee settles to link.feeReceiver in destination currency.

If destination controller is null, tariff and State-collected consumption tax are zero.

24\. Trade candidate economics

Destination reference buyer price is the local gross price appropriate to the demand class. Candidate landed unit cost includes FX spread when applicable, transport fee, tariff and relevant consumption tax.

marginNormalized \= (destinationReferenceGrossUnitPrice \- landedGrossUnitCost) / max(destinationReferenceGrossUnitPrice, moneyEpsilon)  
score \= tradeProfitWeight × marginNormalized \+ shortageWeight × shortageRateDestination

Candidate is eligible if:  
\- score \> configured minimumTradeScore; and  
\- landed cost is within configured shortage premium cap; and  
\- all legal, goods, budget, route and FX constraints admit positive quantity.

This allows severe shortages to sustain bounded imports slightly above the local reference price without an omniscient welfare override.

Stable candidate sort:  
1\) descending score;  
2\) originRegionId;  
3\) destinationRegionId;  
4\) goodId;  
5\) linkId.

25\. Trade quantity sizing

For candidate k:

q \<= source remaining exportable quantity  
q \<= destination remaining effective import demand  
q \<= remainingLinkCapacity / cargoWeightPerUnit  
q \<= buyer aggregate remaining destination-currency budget / estimated landed gross unit cost  
q \<= legal/policy quantity cap if configured  
q \<= FX reserve/input capacity converted into source invoice capacity

Choose the minimum feasible bound.

After candidate aggregate q is determined, distribute seller contribution proportionally across eligible source sellers and buyer allocation proportionally across eligible destination buyers. Stable two-pointer matching then creates concrete shipment lots. This avoids O(sellers×buyers) pair search and prevents the first actor ID from monopolizing rationing inside a candidate.

26\. Atomic shipment settlement

Every concrete shipment lot uses a single transaction bundle and preflight/commit pattern.

Preflight calculates all deltas without mutating canonical state:  
\- seller inventory removal;  
\- buyer gross debit;  
\- seller net receipt;  
\- FX pool input/output deltas when currencies differ;  
\- destination tariff/consumption-tax credits;  
\- transport fee receiver credit;  
\- link capacity usage;  
\- shipment creation.

Commit only if every delta remains legal after applying previously committed Phase-7 bundles.

For different currencies, the goods-payment FX leg is executed through settleFx exactly once. Tariff and transport fee are destination-currency transfers and require no additional FX leg under the core-v1 invoice convention.

If FX is partially fillable, resize q BEFORE any goods leave seller inventory and recompute every proportional fee/tax amount. If q falls below quantityEpsilon, reject the bundle with no mutation.

27\. Shipment persistent extension

TradeShipmentState from CORE\_SCHEMA is additively extended:

invoiceCurrencyId: CurrencyId;  
buyerPaymentCurrencyId: CurrencyId;  
sellerNetUnitPrice: number;  
buyerGoodsPaymentAmount: number;  
transportFeeAmount: number;  
tariffAmount: number;  
consumptionTaxAmount: number;  
fxSettlementId?: FxSettlementId;  
transportLinkId: TransportLinkId;  
beneficialOwner: ActorRef; // normally buyer after dispatch settlement  
destinationInventoryBucket: 'GENERAL' | 'INPUT' | 'OUTPUT' | 'INVESTMENT'; // copied from the destination BUY intent so delayed delivery remains unambiguous

quantity is current physical in-transit quantity, not original planned quantity.

At successful dispatch:  
\- seller-local inventory decreases exactly once;  
\- seller is paid according to bundle;  
\- buyer becomes beneficial owner of shipment;  
\- shipment quantity is excluded from both origin and destination local inventories until delivery;  
\- buyer demand allocated to that shipment is removed from Phase-8 residual demand even if arrival is later;  
\- destinationInventoryBucket is frozen at dispatch from the destination BUY intent and is used at delivery. A delayed import must not lose whether it was INPUT, INVESTMENT or GENERAL stock.

No automatic refund exists for later event loss in core v1. Cargo insurance is excluded.

28\. Arrival semantics

Existing in-transit shipments with arrivalTick \== current tick are delivered in Phase 1 before Phase-2 planning. Their surviving quantity enters the beneficial owner’s destination inventory and the shipment is removed from the active registry after a DELIVERY transaction is logged.

A zero-travel shipment created in Phase 7 has arrivalTick \== current tick and is delivered in a Phase-7 close substep after all dispatch settlement but before Phase 8\. Therefore it may satisfy current planned demand and be physically available for Phase-9 consumption, but it cannot retroactively feed Phase-5 production.

A shipment with travelTicks \> 0 arrives at Phase 1 of its future arrival tick.

If routinePhysicalLossRate \> 0, configured deterministic loss is applied once at dispatch as a GOODS\_TRANSPORT\_LOSS destruction record before the surviving quantity becomes TradeShipment.quantity. Default is zero. Events may later damage in-transit quantity explicitly.

29\. Shipment IDs

Shipment IDs must be deterministic from stable semantic inputs, for example:

sh:{tick}:{origin}:{destination}:{good}:{sellerKey}:{buyerKey}:{ordinalWithinStablePair}

Do not derive IDs from hash-map iteration order. Multiple allocations with the same semantic key in one tick use a stable ordinal produced after sorted matching.

30\. Trade transaction bundle

A cross-region shipment bundle may contain:

A. TRADE\_GOODS\_SALE  
\- buyer \-\> seller;  
\- goodId, dispatched quantity;  
\- seller invoice currency and net value;  
\- source/destination regions.

B. FX\_INPUT and FX\_OUTPUT, only if currencies differ  
\- linked by fxSettlementId.

C. TRANSPORT\_FEE  
\- buyer \-\> feeReceiver;  
\- destination currency.

D. IMPORT\_TARIFF, if applicable  
\- buyer \-\> destination State;  
\- destination currency;  
\- taxBaseAmount \= customsValueDest.

E. CONSUMPTION\_TAX, if applicable  
\- buyer \-\> destination State;  
\- destination currency;  
\- originatingTransactionId \= TRADE\_GOODS\_SALE.

F. SHIPMENT\_DISPATCH  
\- physical ownership/location record; no extra cash.

G. optional GOODS\_TRANSPORT\_LOSS  
\- explicit real-goods destruction.

H. SHIPMENT\_DELIVERY at arrival  
\- shipment \-\> buyer destination inventory; no new sale cash.

All records share bundleId or causalIds sufficient to reconstruct the complete settlement.

31\. Same-currency trade

If origin and destination settlementCurrencyId are equal:  
\- no FX pair lookup;  
\- no FxSettlementReceipt;  
\- buyer goods payment is a direct buyer \-\> seller transfer in that currency;  
\- tariff may still apply when a State border is crossed;  
\- transport fee remains destination currency, which is the same currency;  
\- all shipment/goods rules are otherwise identical.

Monetary-union members therefore trade cross-border without bilateral FX but may still have distinct tariff law if scenario policy permits it.

32\. Trade law and border gate

Trade permission is a pure query over Phase-1 effective state/policy:

canShip(originRegionId, destinationRegionId, goodId, actorRefs, tickContext) \-\> TradeEligibility

It may consider:  
\- link enabled;  
\- destination/source controller;  
\- trade openness / embargo-category gate if explicitly configured;  
\- good-category restriction;  
\- actor legal eligibility where later specs require it.

It may not inspect future jurisdiction or mutate policy.

No generic hidden 'border friction' money sink is allowed. Any monetary friction must be tariff, transport fee or FX spread with an explicit accounting destination.

## 33\. Market telemetry required for Phase 15 and UI

Per region/good/pass:  
\- desiredDemandQuantity;  
\- effectiveDemandQuantity;  
\- offeredQuantity;  
\- clearedQuantity;  
\- sellerNetPrice;  
\- householdGrossPrice reference;  
\- unmetDemandQuantity;  
\- unsoldOfferQuantity;  
\- shortageRate;  
\- surplusRate;  
\- importDispatchedQuantity;  
\- importArrivedQuantity;  
\- exportDispatchedQuantity;  
\- averageLandedImportCost;  
\- consumptionTaxCollected.

Per link/good:  
\- capacityAvailable;  
\- capacityUsed;  
\- rejectedByCapacity;  
\- transportFees;

Per FX pair:  
\- desired/filled base demand and supply;  
\- input/output amounts by currency;  
\- reserve-limited rejected amount;  
\- opening/closing pool inventories;  
\- spot used;  
\- spread.

Canonical shortage/surplus telemetry uses the same realized ratios as section 9: shortageRate \= effectiveDemandQuantity \> quantityEpsilon ? unmetDemandQuantity / effectiveDemandQuantity : 0; surplusRate \= offeredQuantity \> quantityEpsilon ? unsoldOfferQuantity / offeredQuantity : 0\. For the M3 Milestone Preview, display the realized Phase-8 MAIN-pass shortageRate and surplusRate; do not derive a second surplus metric. PRE\_PRODUCTION telemetry may use the same ratio definitions where emitted, but it never updates MarketExpectationState.  
Telemetry is not mutable economic truth and may be aggregated/discarded after snapshot generation according to retention policy.

34\. ExplanationFacts

Required causal facts should be generated from actual mechanisms, not inferred correlation. Examples:  
\- MARKET\_PRICE\_MOVED because excess demand and inventory gap contributed X/Y;  
\- IMPORT\_REJECTED because link capacity or FX reserve was binding;  
\- IMPORT\_COST\_CHANGED because source price / FX / tariff / transport components changed;  
\- SHORTAGE persisted because effective demand exceeded post-trade supply;  
\- FX\_RESERVE\_LIMITED quantity Q in pair P.

Every fact should reference marketId/linkId/pairId and originating transaction/bundle IDs when applicable.

35\. Deterministic APIs

Recommended module boundary:

MarketPricing.buildBooks(world, ctx)  
MarketPricing.updatePrices(world, ctx)  
MarketClearing.allocateLocal(world, ctx, marketId, goodId, pass)  
MarketSettlement.executeAllocation(world, ctx, allocation)  
TradePlanner.buildCandidates(world, ctx)  
TradePlanner.allocate(world, ctx, candidates)  
TradeSettlement.executePlan(world, ctx, plan)  
FxService.quoteFx(world, ctx, request)  
FxService.reserveFx(ctx, quote)  
FxService.settleFx(world, ctx, request)  
ShipmentService.deliverDue(world, ctx)

Pure planning/allocation functions should return plans/deltas. Mutation belongs in explicit settlement/delivery functions.

36\. Stable ordering rules

All deterministic ordering uses canonical IDs, never object insertion order.

Market books: regionId \-\> goodId \-\> side \-\> actorKey \-\> intentId.  
Trade candidates: score desc \-\> origin \-\> destination \-\> good \-\> link.  
Seller/buyer proportional residual correction: actorKey \-\> intentId.  
Shipment matching: sellerKey \-\> buyerKey \-\> good \-\> link.  
FX reservations: inherited trade-candidate/bundle order.  
Due shipment delivery: arrivalTick \-\> shipmentId.

Floating ties within configured epsilon are treated as ties and resolved by IDs, not machine-specific incidental ordering.

37\. Failure semantics

Expected economic failure is data, not an exception:  
\- insufficient buyer budget \-\> partial/no fill;  
\- insufficient seller stock \-\> partial/no fill;  
\- link full \-\> rejected capacity telemetry;  
\- FX reserve floor \-\> partial/no fill \+ unmet FX demand;  
\- dormant market \-\> no clearing;  
\- prohibited border \-\> no candidate;  
\- State absent \-\> no State tax/tariff.

Programmer/invariant errors SHOULD fail validation/test execution:  
\- negative canonical stock after commit;  
\- missing referenced actor/region/good/currency;  
\- cross-currency goods payment without settleFx;  
\- duplicated shipment ownership;  
\- pool below reserve floor from accepted settlement;  
\- transaction bundle debits \!= credits by currency;  
\- price NaN/Infinity/outside hard bounds.

## 38\. Accounting invariants

MTFX-I1 Local sale goods conservation: seller inventory decrease \== buyer inventory increase.  
MTFX-I2 Local sale cash: buyer gross debit \== seller net receipt \+ collected consumption tax.  
MTFX-I3 Sum seller fills \== sum buyer fills \== cleared quantity within tolerance.  
MTFX-I4 No BUY intent settles above maxSpend; no SELL intent settles above sellable quantity.  
MTFX-I5 Price changes at most once per tick and stays within configured bounds.  
MTFX-I6 Market owns no cash or physical goods.  
MTFX-I7 Export-reserved goods cannot also clear locally.  
MTFX-I8 Import-allocated buyer demand cannot also clear locally.  
MTFX-I9 Link used capacity \<= effective capacity.  
MTFX-I10 Shipment departure removes source-local goods exactly once.  
MTFX-I11 In-transit goods exist in shipment registry and no local inventory simultaneously.  
MTFX-I12 Delivery removes shipment quantity and adds destination owner inventory exactly once.  
MTFX-I13 Explicit routine/event cargo loss is the only way shipment physical quantity falls before delivery.  
MTFX-I14 Same-currency shipment has zero FX settlements.  
MTFX-I15 Every cross-currency goods payment has exactly one settleFx receipt.  
MTFX-I16 FX conversion conserves input and output currencies independently across actor \+ pool.  
MTFX-I17 Pool output reserve never falls below configured floor.  
MTFX-I18 FX spread remains in pool stocks; it is not a money-creation/destruction entry.  
MTFX-I19 Tariff payer debit \== destination State credit and tariff was included before affordability.  
MTFX-I20 Transport fee payer debit \== feeReceiver credit.  
MTFX-I21 No shipment is created if required FX/goods/budget/capacity preflight fails.  
MTFX-I22 Current-tick spot FX is immutable during Phase 7; rate update can affect only N+1.  
MTFX-I23 Phase-14 jurisdiction changes cannot alter tick-N trade classification/tax.  
MTFX-I24 Equal seed/config/version and semantically equal registry contents produce equal market/trade/FX results independent of insertion order.  
MTFX-I25 Every ProductionUnit market transfer uses an explicit inventory bucket: INPUT purchases credit inputInventory, INVESTMENT purchases credit investmentInventory, output sales debit outputInventory, and delayed shipment delivery preserves the bucket chosen at dispatch.

## 39\. Required unit/integration tests

MTFX-T1 Zero D and zero S leaves price unchanged.  
MTFX-T2 Extreme excess demand/supply respects max log step and price floor/ceiling.  
MTFX-T3 Consumption tax reduces affordable quantity at fixed cash and splits buyer debit exactly seller/State.  
MTFX-T4 An injected taxPolicy fixture with collectionEfficiency strictly between 0 and 1 credits only collected tax, leaves assessed-but-uncollected tax with the buyer, and proves M3 does not assume collectionEfficiency \= 1 or require M6 policy dynamics.  
MTFX-T5 Proportional seller/buyer rationing conserves quantity and is insertion-order invariant.  
MTFX-T6 Buyer maxSpend and seller reserve are never violated after floating residual correction.  
MTFX-T7 Phase-4 procurement cannot consume a Phase-7 same-tick import.  
MTFX-T8 Phase-7 allocated import demand cannot buy same quantity again in Phase 8\.  
MTFX-T9 Closed/zero-capacity link yields no shipment.  
MTFX-T10 Link capacity shared across goods never exceeds cargo-weight capacity.  
MTFX-T11 Same-currency cross-State trade applies tariff but emits no FX leg.  
MTFX-T12 Cross-currency trade debits buyer destination currency, changes pool inventories, and credits seller source currency exactly.  
MTFX-T13 Exhausted source-currency pool reserve shrinks trade quantity before seller inventory mutation.  
MTFX-T14 Two competing trades sharing one FX pool respect deterministic reservation order and total reserve cap.  
MTFX-T15 Tariff is based on mid-converted invoice \+ transport, not on FX spread, and is credited to destination treasury.  
MTFX-T16 Transport fee is credited to configured receiver in destination currency.  
MTFX-T17 Foreign-currency transport receiver may accumulate that currency without implicit conversion.  
MTFX-T18 Zero-travel shipment dispatches and delivers before Phase 8 but is unavailable to Phase-5 production.  
MTFX-T19 Positive-travel shipment remains in registry until Phase-1 arrival of future tick.  
MTFX-T20 Routine cargo loss, when enabled, creates exactly one destruction flow and no refund.  
MTFX-T21 Reordering WorldState registry insertion leaves shipment IDs and allocations unchanged.  
MTFX-T22 Trade policy change decided in N but activating N+1 leaves N bundles unchanged.  
MTFX-T23 Monetary-union regions with same currency require no FX even when different States.  
MTFX-T24 Per-currency transaction reconciliation passes after a 600-tick multi-state/multi-currency benchmark.  
MTFX-T25 ProductionUnit INPUT and INVESTMENT purchases land in distinct inventories and output sales debit only outputInventory.  
MTFX-T26 A positive-travel import preserves its destination inventory bucket through shipment persistence and credits that exact bucket on arrival.  
MTFX-T27 Market expectations bootstrap deterministically: a no-information MAIN pass leaves expectation state unchanged; the first informative MAIN pass initializes expected-use/shortage/surplus EMAs directly from realized aggregates; later informative passes apply expectationAlpha; Phase-6 uses current D only before the first observation and lagged expectedUseEma afterward; targetInventoryCoverageTicks controls only inventory-gap pressure and never owns or reserves stock.

## 40\. Benchmark/golden scenarios

A. Local shortage: one region, fixed money, food supply shock. Price rises boundedly, effective demand rations, no money/goods appear.

B. Comparative advantage: two linked regions with opposite production cost/endowment patterns. Trade flows emerge toward cheaper landed source and reduce destination shortage without scripted specialization.

C. Transport bottleneck: low-capacity link becomes binding; source surplus and destination shortage coexist; infrastructure capacity increase later raises trade.

D. Tariff divergence: otherwise identical destinations with different tariff policy show different import volumes and treasury receipts through landed cost only.

E. FX scarcity: two currencies, one thin pool. Persistent unilateral imports deplete exporter-currency reserve, ration shipments and create next-tick FX pressure.

F. Monetary union: two States, one currency. Cross-border trade uses normal cash settlement without FX while fiscal/tariff identities remain State-specific.

G. Shipment delay shock: travelTicks \> 0 plus event destruction. Paid shipment stays in transit, partial goods loss is explicit, buyer consumption shortfall appears later without phantom refund.

41\. Complexity target

Let R \= regions, G \= goods, I \= market intents, L \= directed links, C \= trade candidates, A \= concrete allocations, F \= FX settlements.

Per tick target:  
\- market aggregation/pricing O(I \+ R×G);  
\- local proportional allocation O(I log I) worst case from stable sorting, near O(I) with pre-indexed ordered lists;  
\- candidate generation O(L×G \+ relevant residual intent aggregation);  
\- candidate sorting O(C log C), with C bounded by sparse L×G;  
\- concrete trade matching O(A);  
\- FX quote/settlement O(F);  
\- due shipment delivery O(number due), using arrivalTick index/cache if needed.

Never generate all region pairs. Never generate all seller×buyer pairs. Never create all currency pairs.

42\. Configuration surface

Market pricing and expectation configuration is not redefined here. Use the exact canonical fields owned by CANONICAL\_CONFIG\_AND\_WORLD\_GENERATION section 4 and bound by section 9:  
\- SimulationConfig.markets.basePriceAdjustmentSpeed;  
\- SimulationConfig.markets.maxAbsoluteLogPriceMovePerTick;  
\- SimulationConfig.markets.minimumPrice;  
\- SimulationConfig.markets.maximumPrice;  
\- SimulationConfig.markets.targetInventoryCoverageTicks;  
\- SimulationConfig.markets.shortageSignalWeight;  
\- SimulationConfig.markets.inventorySignalWeight;  
\- SimulationConfig.markets.expectationAlpha.  
SimulationConfig.numeric.quantityEpsilon and moneyEpsilon remain numeric-domain thresholds owned by NumericConfig; they are not MarketConfig fields.

TradeConfig:  
\- tradeProfitWeight;  
\- shortageWeight;  
\- minimumTradeScore;  
\- shortagePremiumCap;  
\- maxExportShare if retained;  
\- minimum operational link condition;  
\- transport cost condition cap;  
\- routinePhysicalLossRate default 0;  
\- travelTicks per link/scenario.

FxConfig per active pair:  
\- base/quote IDs;  
\- initial pool inventories;  
\- spot;  
\- spread;  
\- reserve floors;  
\- target reserve share;  
\- liquidity scale and rate-response coefficients owned by MONETARY;  
\- max next-tick rate move.

Fiscal tax/tariff schedules remain State policy/config and are queried, not duplicated in MarketConfig.

43\. Migration map from current repository

Preserve conceptually:  
\- Market.Price \-\> LocalMarketState.priceByGood;  
\- Market demand/supply/traded/imported/exported \-\> TickContext telemetry, not persistent Market stock;  
\- Market.UpdatePrices bounded movement \-\> bounded log-price formula;  
\- City.UpdateMarket affordable demand concept \-\> MarketIntent effective demand using gross price;  
\- City.ClearLocalMarket proportional rationing \-\> MarketClearing.allocateLocal;  
\- deterministic fixed-order resource handling \-\> stable ID ordering, but without allowing order-dependent reuse of unplanned sale proceeds.

Replace:  
\- Pop.Money scalar \-\> Wallet\[CurrencyId\];  
\- Storage enum-index vectors \-\> sparse Inventory/GoodId;  
\- City.NeighbourCities object graph \-\> TransportLink registry;  
\- City.RemainingTradePower \-\> shared TransportLink capacity;  
\- trader Pop and Deal.FindBestDeal \-\> TradePlanner candidate/allocation pipeline;  
\- Deal trader-held cargo/unsold returns \-\> TradeShipment with explicit beneficial owner and destination demand;  
\- Deal.TransportLossShare hidden arithmetic \-\> explicit optional real-goods destruction;  
\- implicit single numeraire \-\> Region settlement currencies \+ finite FxLiquidityPool;  
\- implicit trade profit money creation risk \-\> exact buyer/seller/fee/tax/FX ledger bundle.

44\. Hard exclusions for implementation

Do not add while implementing this spec:  
\- order books or per-agent limit-price strategies;  
\- traders as mandatory occupation/class;  
\- magical world-market inventory;  
\- multi-hop shortest-path routing;  
\- FX order books, speculative conversion or arbitrage bots;  
\- automatic central-bank FX rescue;  
\- hidden trade friction money sinks;  
\- merchant credit, invoice debt or insurance;  
\- dynamic currencies/redenomination;  
\- variable retail markups per seller;  
\- stochastic clearing priority;  
\- tax evasion;  
\- market-owned warehouses or cash.

45\. Acceptance gate

This work unit is implementation-ready when Codex/Claude can implement Phase 4, Phase 6, Phase 7 and Phase 8 without choosing new economic rules.

Required acceptance:  
\- exact types above exist or are represented equivalently;  
\- local price meaning is net seller price;  
\- affordability is tax-aware before clearing;  
\- market allocations are proportional and deterministic;  
\- all physical and money transfers are atomic/preflighted;  
\- trade is sparse link-based and adjacent-link only;  
\- buyer funds imported goods in destination settlement currency;  
\- seller receives origin settlement currency;  
\- one finite FX pool handles each required currency pair;  
\- FX scarcity reduces shipment quantity before goods movement;  
\- transport/tariff/tax destinations are explicit;  
\- shipment arrival timing matches canonical phases;  
\- all MTFX invariants and tests pass;  
\- no new economic actor is introduced merely to make clearing work.

46\. Dependency note

Production \+ Capital \+ Labor implementation is defined in 05 — PRODUCTION\_CAPITAL\_LABOR\_CONTRACTS. That contract consumes MarketIntent and market settlement exactly as defined here and must not introduce a parallel procurement or sales mechanism.

Conclusion

The v1 market/trade stack is intentionally small: persistent local prices, ephemeral budgeted intentions, proportional deterministic clearing, sparse directed-link trade, explicit shipments and one finite FX settlement primitive. The result preserves the prototype’s strongest property—simple local disequilibrium that can generate meaningful trade—while removing its largest implementation ambiguities. Goods, money, tax, transport fees and foreign exchange now have explicit owners, currencies, timing and reconciliation paths; scarcity at any layer produces a partial fill instead of phantom inventory or balancing cash.  
