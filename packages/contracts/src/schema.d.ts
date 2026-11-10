// AUTO-GENERATED from services/api OpenAPI. Do not edit; run `npm run contracts`.
export interface paths {
    "/api/v1/analyses/sensitivity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Sensitivity */
        post: operations["create_sensitivity_api_v1_analyses_sensitivity_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Catalog */
        get: operations["get_catalog_api_v1_catalog_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/comparisons": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Comparison */
        post: operations["create_comparison_api_v1_comparisons_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/comparisons/{comparison_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Comparison */
        get: operations["get_comparison_api_v1_comparisons__comparison_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health */
        get: operations["health_api_v1_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/ready": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Ready */
        get: operations["ready_api_v1_ready_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scenarios": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Create Scenario */
        post: operations["create_scenario_api_v1_scenarios_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scenarios/{scenario_id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Get Scenario */
        get: operations["get_scenario_api_v1_scenarios__scenario_id__get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scenarios/{scenario_id}/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Export Scenario */
        get: operations["export_scenario_api_v1_scenarios__scenario_id__export_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/scenarios/{scenario_id}/replay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * Replay Scenario
         * @description Recompute the stored comparison from its retained snapshot (determinism check).
         */
        get: operations["replay_scenario_api_v1_scenarios__scenario_id__replay_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/sources/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Sources Status */
        get: operations["sources_status_api_v1_sources_status_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AdapterStatus */
        AdapterStatus: {
            /** Credentials Configured */
            credentials_configured?: boolean | null;
            /** Error */
            error: string | null;
            /** Expires At */
            expires_at: string | null;
            /** Fetched At */
            fetched_at: string | null;
            /** Fresh */
            fresh: boolean;
            /** Kind */
            kind: string;
            /** Observed At */
            observed_at: string | null;
            /** Provenance Url */
            provenance_url: string | null;
            /** Source Id */
            source_id: string;
            /**
             * Status
             * @enum {string}
             */
            status: "live_api" | "provider_estimate" | "published_tariff" | "historical" | "user_assumption" | "unavailable";
        };
        /** AmountRange */
        AmountRange: {
            /** Max */
            max: string;
            /** Min */
            min: string;
            /**
             * Scale
             * @default log
             * @enum {string}
             */
            scale: "log" | "linear";
            /**
             * Steps
             * @default 24
             */
            steps: number;
        };
        /** CatalogOut */
        CatalogOut: {
            /** Corridors */
            corridors: components["schemas"]["CorridorOut"][];
            /** Countries */
            countries: components["schemas"]["CountryOut"][];
            /** Currencies */
            currencies: components["schemas"]["CurrencyOut"][];
            /** Default Corridor */
            default_corridor: {
                [key: string]: string;
            };
            /** Networks */
            networks: components["schemas"]["NetworkOut"][];
            /** Notes */
            notes: string[];
            /** Objectives */
            objectives: string[];
            /** Tariffs */
            tariffs: components["schemas"]["TariffOut"][];
            /** Venues */
            venues: components["schemas"]["VenueOut"][];
            /** Version */
            version: string;
        };
        /** ComparisonRequest */
        ComparisonRequest: {
            /** Deadline Minutes */
            deadline_minutes?: number | null;
            /** Destination Country */
            destination_country: string;
            /** Destination Currency */
            destination_currency: string;
            /**
             * Funding Method
             * @default any_bank
             */
            funding_method: string;
            /**
             * Mode
             * @default current
             * @constant
             */
            mode: "current";
            /**
             * Objective
             * @default MOST_RECEIVED
             * @enum {string}
             */
            objective: "MOST_RECEIVED" | "FASTEST" | "WITHIN_DEADLINE";
            overrides?: components["schemas"]["Overrides"];
            /**
             * Payout Method
             * @default any_bank
             */
            payout_method: string;
            /** Send Amount */
            send_amount: string;
            /** Source Country */
            source_country: string;
            /** Source Currency */
            source_currency: string;
            /**
             * Start Time
             * @description When the sender starts funding (defaults to now)
             */
            start_time?: string | null;
            /**
             * Time Basis
             * @description Which time FASTEST / WITHIN_DEADLINE use: whole transfer, or only the conversion (trade, withdrawal, on-chain, exchange credit; excludes fiat pay-in, holds and payout)
             * @default END_TO_END
             * @enum {string}
             */
            time_basis: "END_TO_END" | "CONVERSION";
        };
        /** ComparisonResponse */
        ComparisonResponse: {
            /** Catalog Version */
            catalog_version: string;
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Disclaimer */
            disclaimer: string;
            /** Excluded */
            excluded: components["schemas"]["RouteResult"][];
            /** Fastest Route Id */
            fastest_route_id: string | null;
            /** Id */
            id: string;
            /** Is Simulation Override */
            is_simulation_override: boolean;
            /** Model Version */
            model_version: string;
            /** Most Received Route Id */
            most_received_route_id: string | null;
            /** Pareto Route Ids */
            pareto_route_ids: string[];
            /** Recommendation Grade */
            recommendation_grade: ("current" | "research") | null;
            /** Recommendation Reason */
            recommendation_reason: string;
            /** Recommended Route Id */
            recommended_route_id: string | null;
            reference_fx: components["schemas"]["ReferenceFx"] | null;
            request: components["schemas"]["ComparisonRequest"];
            /** Routes */
            routes: components["schemas"]["RouteResult"][];
            snapshot: components["schemas"]["SnapshotMeta"];
            /** Source Errors */
            source_errors: components["schemas"]["SourceError"][];
            /** Warnings */
            warnings: string[];
        };
        /** CorridorOut */
        CorridorOut: {
            /** Conventional */
            conventional: boolean;
            /** Destination Country */
            destination_country: string;
            /** Explanation */
            explanation: string;
            /** Source Country */
            source_country: string;
            /** Usdc */
            usdc: boolean;
            /** Usdc Venue Pairs */
            usdc_venue_pairs: number;
        };
        /** CountryOut */
        CountryOut: {
            /** Code */
            code: string;
            /** Currency */
            currency: string;
            /** Name */
            name: string;
            /** Rails */
            rails: components["schemas"]["RailOut"][];
            /** Region */
            region: string;
        };
        /** Crossover */
        Crossover: {
            /** Amount */
            amount: string;
            /** Between */
            between: string[];
            /** Description */
            description: string;
            /**
             * Metric
             * @enum {string}
             */
            metric: "cost" | "time";
        };
        /** CurrencyOut */
        CurrencyOut: {
            /** Amount Default */
            amount_default: string;
            /** Amount Max */
            amount_max: string;
            /** Amount Min */
            amount_min: string;
            /** Code */
            code: string;
            /** Dp */
            dp: number;
            /** Name */
            name: string;
        };
        /** Duration */
        Duration: {
            /** Known */
            known: boolean;
            /** Max */
            max?: number | null;
            /** Min */
            min?: number | null;
            /** Note */
            note?: string | null;
            /** Typical */
            typical?: number | null;
            /**
             * Unit
             * @default minutes
             * @constant
             */
            unit: "minutes";
        };
        /** FeeItem */
        FeeItem: {
            /** Amount */
            amount: string;
            /**
             * Amount Source
             * @description Source-currency equivalent at the reference rate
             */
            amount_source?: string | null;
            /**
             * Assumption
             * @default false
             */
            assumption: boolean;
            /**
             * Category
             * @enum {string}
             */
            category: "funding" | "trading" | "conversion" | "withdrawal" | "network" | "deposit" | "payout" | "provider" | "intermediary" | "receiving" | "fx_spread" | "implied_spread_impact";
            /** Label */
            label: string;
            /** Source Id */
            source_id?: string | null;
            /**
             * Source Status
             * @enum {string}
             */
            source_status: "live_api" | "provider_estimate" | "published_tariff" | "historical" | "user_assumption" | "unavailable";
            /** Unit */
            unit: string;
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** HeatmapCell */
        HeatmapCell: {
            /** Amount */
            amount: string;
            /** Axis Value */
            axis_value: string;
            /** Best Conventional Route Id */
            best_conventional_route_id: string | null;
            /** Best Usdc Route Id */
            best_usdc_route_id: string | null;
            /**
             * Classification
             * @enum {string}
             */
            classification: "cheaper" | "faster" | "both" | "neither" | "unavailable";
            /** Cost Advantage Pct */
            cost_advantage_pct: string | null;
            /** Time Advantage Minutes */
            time_advantage_minutes: number | null;
        };
        /** LegResult */
        LegResult: {
            /** Amount In */
            amount_in: string;
            /** Amount Out */
            amount_out: string;
            /**
             * Assumptions
             * @default []
             */
            assumptions: string[];
            /**
             * Detail
             * @default {}
             */
            detail: {
                [key: string]: unknown;
            };
            duration: components["schemas"]["Duration"];
            /** Fee */
            fee: string;
            /** Fee Unit */
            fee_unit: string;
            /** Index */
            index: number;
            /** Kind */
            kind: string;
            /** Label */
            label: string;
            /** Observed At */
            observed_at?: string | null;
            /** Provider */
            provider: string;
            /** Schedule */
            schedule?: string | null;
            /**
             * Source Ids
             * @default []
             */
            source_ids: string[];
            /**
             * Source Status
             * @enum {string}
             */
            source_status: "live_api" | "provider_estimate" | "published_tariff" | "historical" | "user_assumption" | "unavailable";
            /** Unit In */
            unit_in: string;
            /** Unit Out */
            unit_out: string;
        };
        /** NetworkOut */
        NetworkOut: {
            /** Docs Url */
            docs_url: string | null;
            /** Family */
            family: string;
            /** Gas Token */
            gas_token: string;
            /** Id */
            id: string;
            /** L2 */
            l2: boolean;
            /** Name */
            name: string;
            /** Native Usdc */
            native_usdc: boolean;
            /** Note */
            note: string;
            /** Usdc Contract */
            usdc_contract: string | null;
            /** Venues */
            venues: string[];
        };
        /** Observation */
        Observation: {
            /** Data */
            data?: {
                [key: string]: unknown;
            } | null;
            /** Error */
            error?: string | null;
            /** Expires At */
            expires_at?: string | null;
            /**
             * Fetched At
             * Format: date-time
             */
            fetched_at: string;
            /** Methodology Version */
            methodology_version: string;
            /** Observed At */
            observed_at?: string | null;
            /** Provenance Url */
            provenance_url?: string | null;
            /** Scope */
            scope: string;
            /** Source Id */
            source_id: string;
            /**
             * Status
             * @enum {string}
             */
            status: "live_api" | "provider_estimate" | "published_tariff" | "historical" | "user_assumption" | "unavailable";
            /** Unit */
            unit?: string | null;
            /** Value */
            value?: string | null;
        };
        /**
         * Overrides
         * @description Counterfactual market assumptions. Any non-default value marks results as simulations.
         */
        Overrides: {
            /**
             * Bank Fx Spread Bps
             * @description Override the bank-wire FX margin assumption
             */
            bank_fx_spread_bps?: string | null;
            /**
             * Depth Multiplier
             * @default 1
             */
            depth_multiplier: string;
            /**
             * Funding Delay Hours
             * @default 0
             */
            funding_delay_hours: string;
            /**
             * Max Price Impact Bps
             * @description Reject book fills that move price more than this
             * @default 100
             */
            max_price_impact_bps: string;
            /**
             * Network Fee Multiplier
             * @default 1
             */
            network_fee_multiplier: string;
            /**
             * Payout Delay Hours
             * @default 0
             */
            payout_delay_hours: string;
            /**
             * Provider Fee Multiplier
             * @default 1
             */
            provider_fee_multiplier: string;
            /**
             * Spread Bps
             * @description Extra FX spread (bps) applied to every conversion/book
             * @default 0
             */
            spread_bps: string;
            /**
             * Trading Fee Override Pct
             * @description Override every venue's taker fee (percent)
             */
            trading_fee_override_pct?: string | null;
        };
        /** RailOut */
        RailOut: {
            /** Currency */
            currency: string;
            /** Description */
            description: string;
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Schedule */
            schedule: string;
        };
        /** ReferenceFx */
        ReferenceFx: {
            /** Base */
            base: string;
            /** Cross Check */
            cross_check?: {
                [key: string]: unknown;
            } | null;
            /** Derivation */
            derivation: string;
            /** Observed At */
            observed_at: string | null;
            /** Quote */
            quote: string;
            /** Rate */
            rate: string;
            /** Source Ids */
            source_ids: string[];
            /**
             * Status
             * @enum {string}
             */
            status: "live_api" | "provider_estimate" | "published_tariff" | "historical" | "user_assumption" | "unavailable";
            /** Unit */
            unit: string;
        };
        /** RouteResult */
        RouteResult: {
            /** All In Cost Pct */
            all_in_cost_pct?: string | null;
            /** Destination Venue */
            destination_venue?: string | null;
            duration: components["schemas"]["Duration"];
            /** Effective Rate */
            effective_rate?: string | null;
            /** Eligible */
            eligible: boolean;
            /** Estimated Arrival */
            estimated_arrival?: string | null;
            /**
             * Exclusion Codes
             * @default []
             */
            exclusion_codes: string[];
            /**
             * Exclusion Reasons
             * @default []
             */
            exclusion_reasons: string[];
            /**
             * Fee Breakdown
             * @default []
             */
            fee_breakdown: components["schemas"]["FeeItem"][];
            /** Funding Method */
            funding_method?: string | null;
            /** Id */
            id: string;
            /**
             * Input Quality
             * @default assumed
             * @enum {string}
             */
            input_quality: "live" | "mixed" | "assumed";
            /** Label */
            label: string;
            /**
             * Legs
             * @default []
             */
            legs: components["schemas"]["LegResult"][];
            /** Network */
            network?: string | null;
            /** Payout Method */
            payout_method?: string | null;
            /**
             * Prerequisites
             * @default []
             */
            prerequisites: string[];
            /** Provider Steps */
            provider_steps: string[];
            /** Recipient Amount */
            recipient_amount?: string | null;
            /** Recipient Currency */
            recipient_currency: string;
            /**
             * Recommendation Grade
             * @default research
             * @enum {string}
             */
            recommendation_grade: "current" | "research";
            /**
             * Risks
             * @default []
             */
            risks: string[];
            /**
             * Source Ids
             * @default []
             */
            source_ids: string[];
            /** Source Venue */
            source_venue?: string | null;
            /** Spread Bps */
            spread_bps?: string | null;
            timing_split?: components["schemas"]["TimingSplit"] | null;
            /** Total Cost Source */
            total_cost_source?: string | null;
            /**
             * Type
             * @enum {string}
             */
            type: "conventional_provider" | "bank_wire" | "usdc";
        };
        /** ScenarioCreate */
        ScenarioCreate: {
            /** Comparison Id */
            comparison_id: string;
            /** Label */
            label?: string | null;
            /** Sensitivity Id */
            sensitivity_id?: string | null;
        };
        /** ScenarioOut */
        ScenarioOut: {
            comparison: components["schemas"]["ComparisonResponse"];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Id */
            id: string;
            /** Label */
            label: string | null;
            /** Replay Note */
            replay_note: string;
            sensitivity: components["schemas"]["SensitivityResponse"] | null;
            /** Share Path */
            share_path: string;
        };
        /** SensitivityRequest */
        SensitivityRequest: {
            amount_range?: components["schemas"]["AmountRange"] | null;
            /** Amounts */
            amounts?: string[] | null;
            baseline: components["schemas"]["ComparisonRequest"];
            /** Heatmap Amounts */
            heatmap_amounts?: string[] | null;
            /**
             * Heatmap Axis
             * @default network_fee_multiplier
             */
            heatmap_axis: ("network_fee_multiplier" | "spread_bps" | "depth_multiplier" | "payout_delay_hours" | "provider_fee_multiplier") | null;
            /** Heatmap Values */
            heatmap_values?: string[] | null;
        };
        /** SensitivityResponse */
        SensitivityResponse: {
            /** Amounts */
            amounts: string[];
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /** Crossovers */
            crossovers: components["schemas"]["Crossover"][];
            /** Disclaimer */
            disclaimer: string;
            /** Heatmap */
            heatmap: components["schemas"]["HeatmapCell"][];
            /** Heatmap Amounts */
            heatmap_amounts: string[];
            /** Heatmap Axis */
            heatmap_axis: ("network_fee_multiplier" | "spread_bps" | "depth_multiplier" | "payout_delay_hours" | "provider_fee_multiplier") | null;
            /** Heatmap Values */
            heatmap_values: string[];
            /** Id */
            id: string;
            /** Is Simulation */
            is_simulation: boolean;
            /** Model Version */
            model_version: string;
            /** No Crossover Note */
            no_crossover_note: string | null;
            /** Points Computed */
            points_computed: number;
            request: components["schemas"]["SensitivityRequest"];
            /** Series */
            series: components["schemas"]["Series"][];
            snapshot: components["schemas"]["SnapshotMeta"];
        };
        /** Series */
        Series: {
            /** Key */
            key: string;
            /** Label */
            label: string;
            /** Points */
            points: components["schemas"]["SeriesPoint"][];
        };
        /** SeriesPoint */
        SeriesPoint: {
            /** All In Cost Pct */
            all_in_cost_pct: string | null;
            /** Amount */
            amount: string;
            /** Eligible */
            eligible: boolean;
            /** Label */
            label: string | null;
            /** Recipient Amount */
            recipient_amount: string | null;
            /** Route Id */
            route_id: string | null;
            /** Typical Minutes */
            typical_minutes: number | null;
        };
        /** SnapshotMeta */
        SnapshotMeta: {
            /**
             * Created At
             * Format: date-time
             */
            created_at: string;
            /**
             * Data Mode
             * @enum {string}
             */
            data_mode: "live" | "fixture";
            /**
             * Errors
             * @default []
             */
            errors: components["schemas"]["SourceError"][];
            /** Id */
            id: string;
            /** Observation Count */
            observation_count: number;
        };
        /** SourceError */
        SourceError: {
            /**
             * At
             * Format: date-time
             */
            at: string;
            /** Message */
            message: string;
            /** Source Id */
            source_id: string;
        };
        /** SourcesStatus */
        SourcesStatus: {
            /** Adapters */
            adapters: components["schemas"]["AdapterStatus"][];
            /** Catalog Version */
            catalog_version: string;
            /** Data Mode */
            data_mode: string;
            /** Errors */
            errors: components["schemas"]["SourceError"][];
            /**
             * Generated At
             * Format: date-time
             */
            generated_at: string;
            /** Observations */
            observations: components["schemas"]["Observation"][];
            /** Snapshot Id */
            snapshot_id: string | null;
            /** Tariffs Assumed */
            tariffs_assumed: number;
            /** Tariffs Reviewed */
            tariffs_reviewed: number;
            /** Tariffs Total */
            tariffs_total: number;
        };
        /** TariffOut */
        TariffOut: {
            /** Basis */
            basis: string;
            /** Description */
            description: string;
            /** Effective Date */
            effective_date: string | null;
            /** Fixed */
            fixed: string;
            /** Id */
            id: string;
            /** Pct */
            pct: string;
            /** Provider */
            provider: string;
            /** Reviewed At */
            reviewed_at: string | null;
            /** Source Url */
            source_url: string | null;
            /** Unit */
            unit: string;
        };
        /**
         * TimingSplit
         * @description End-to-end time split into the part spent moving fiat through banks and the conversion itself.
         */
        TimingSplit: {
            /** @description Trade, exchange withdrawal queue, on-chain transfer, exchange credit and FX conversion */
            conversion: components["schemas"]["Duration"];
            /** @description Fiat pay-in, withdrawal holds and fiat payout (bank rails, business hours) */
            rails: components["schemas"]["Duration"];
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
        /** VenueCountryOut */
        VenueCountryOut: {
            /** Country */
            country: string;
            /** Note */
            note: string;
            /** Status */
            status: string;
        };
        /** VenueNetworkOut */
        VenueNetworkOut: {
            /** Deposit */
            deposit: boolean;
            /** Network */
            network: string;
            /** Status */
            status: string;
            /** Withdraw */
            withdraw: boolean;
            /** Withdraw Fee Usdc */
            withdraw_fee_usdc: string;
            /** Withdraw Min */
            withdraw_min: string;
        };
        /** VenueOut */
        VenueOut: {
            /** Countries */
            countries: components["schemas"]["VenueCountryOut"][];
            /** Fee Schedule Url */
            fee_schedule_url: string;
            /** Fiat */
            fiat: string[];
            /** Fiat Market */
            fiat_market: {
                [key: string]: string;
            };
            /** Id */
            id: string;
            /** Name */
            name: string;
            /** Networks */
            networks: components["schemas"]["VenueNetworkOut"][];
            /** Participant Rules */
            participant_rules: string[];
            /** Product Note */
            product_note: string;
            /** Taker Fee Note */
            taker_fee_note: string | null;
            /** Taker Fee Pct */
            taker_fee_pct: string;
            /** Taker Fee Reviewed */
            taker_fee_reviewed: boolean;
            /** Url */
            url: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    create_sensitivity_api_v1_analyses_sensitivity_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SensitivityRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SensitivityResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_catalog_api_v1_catalog_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CatalogOut"];
                };
            };
        };
    };
    create_comparison_api_v1_comparisons_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ComparisonRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ComparisonResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_comparison_api_v1_comparisons__comparison_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                comparison_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ComparisonResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    health_api_v1_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    ready_api_v1_ready_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
        };
    };
    create_scenario_api_v1_scenarios_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ScenarioCreate"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScenarioOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    get_scenario_api_v1_scenarios__scenario_id__get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scenario_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ScenarioOut"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    export_scenario_api_v1_scenarios__scenario_id__export_get: {
        parameters: {
            query?: {
                format?: string;
            };
            header?: never;
            path: {
                scenario_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    replay_scenario_api_v1_scenarios__scenario_id__replay_get: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                scenario_id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ComparisonResponse"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    sources_status_api_v1_sources_status_get: {
        parameters: {
            query?: {
                refresh?: boolean;
            };
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SourcesStatus"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
}
