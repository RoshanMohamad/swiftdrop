export interface paths {
    "/oauth/token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Issue a merchant client-credentials token */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/x-www-form-urlencoded": {
                        /** @enum {string} */
                        grant_type: "client_credentials";
                        scope?: string;
                    };
                };
            };
            responses: {
                /** @description Bearer access token */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            access_token: string;
                            /** @enum {string} */
                            token_type: "Bearer";
                            /** @enum {number} */
                            expires_in: 900;
                            scope: string;
                        };
                    };
                };
                /** @description Invalid OAuth request */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "invalid_request" | "invalid_client" | "invalid_grant" | "unauthorized_client" | "unsupported_grant_type" | "invalid_scope" | "server_error" | "temporarily_unavailable";
                            error_description?: string;
                        };
                    };
                };
                /** @description Invalid client authentication */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "invalid_request" | "invalid_client" | "invalid_grant" | "unauthorized_client" | "unsupported_grant_type" | "invalid_scope" | "server_error" | "temporarily_unavailable";
                            error_description?: string;
                        };
                    };
                };
                /** @description Token request limit exceeded */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "invalid_request" | "invalid_client" | "invalid_grant" | "unauthorized_client" | "unsupported_grant_type" | "invalid_scope" | "server_error" | "temporarily_unavailable";
                            error_description?: string;
                        };
                    };
                };
                /** @description Token service temporarily unavailable */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            error: "invalid_request" | "invalid_client" | "invalid_grant" | "unauthorized_client" | "unsupported_grant_type" | "invalid_scope" | "server_error" | "temporarily_unavailable";
                            error_description?: string;
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/merchant/orders": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** List orders for the authenticated merchant */
        get: {
            parameters: {
                query?: {
                    status?: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Merchant orders */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: {
                                trackingNumber: string;
                                /** @enum {string} */
                                status: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
                                originDistrict: string;
                                destinationDistrict: string;
                                recipientName: string;
                                recipientPhone: string;
                                feeCents: number;
                                /** Format: date-time */
                                createdAt: string;
                            }[];
                        };
                    };
                };
                /** @description Authentication required */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Approved merchant account required */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        /** Create an order for the authenticated merchant */
        post: {
            parameters: {
                query?: never;
                header: {
                    "Idempotency-Key": string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        originDistrict: string;
                        destinationDistrict: string;
                        weightGrams: number;
                        lengthMm: number;
                        widthMm: number;
                        heightMm: number;
                        recipientName: string;
                        recipientPhone: string;
                        recipientAddress: string;
                    };
                };
            };
            responses: {
                /** @description Order created */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            trackingNumber: string;
                            /** @enum {string} */
                            status: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
                            feeCents: number;
                            /** @enum {string} */
                            currency: "LKR";
                            weightGrams: number;
                            lengthMm: number;
                            widthMm: number;
                            heightMm: number;
                            originTown: string;
                            destinationTown: string;
                            recipientName: string;
                            recipientPhone: string;
                            recipientAddress: string;
                            /** Format: date-time */
                            createdAt: string;
                            history: {
                                /** @enum {string} */
                                status: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
                                town: string;
                                /** Format: date-time */
                                createdAt: string;
                            }[];
                        };
                    };
                };
                /** @description Invalid order or idempotency key */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Invalid or expired merchant token */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Merchant approval or orders:write scope required */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Idempotency key reused with different order details */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Route is unserved or pricing is unavailable */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Order service unavailable */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/csrf": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** csrf */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            csrfToken: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** register */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        fullName: string;
                        /** Format: email */
                        email: string;
                        phone: string;
                        password: string;
                    };
                };
            };
            responses: {
                /** @description Success */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/resend-verification": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** resend-verification */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                    };
                };
            };
            responses: {
                /** @description Success */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/verify-email": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** verify-email */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        token: string;
                    };
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/providers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** providers */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            google: boolean;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/complete-profile": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** complete-profile */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        fullName: string;
                        phone: string;
                    };
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: number;
                            /** Format: email */
                            email: string;
                            fullName: string | null;
                            phone: string | null;
                            /** @enum {string} */
                            role: "CUSTOMER" | "MERCHANT" | "COURIER" | "DISPATCHER" | "ADMIN";
                            /** @enum {string} */
                            status: "ACTIVE";
                            emailVerified: boolean;
                            profileComplete: boolean;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/google/link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** google/link */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        password: string;
                    };
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uri */
                            authorizationUrl: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** login */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: email */
                        email: string;
                        password: string;
                    };
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            state: "authenticated";
                            accessToken: string;
                            /** @enum {string} */
                            tokenType: "Bearer";
                            /** @enum {number} */
                            expiresIn: 900;
                            user: {
                                id: number;
                                /** Format: email */
                                email: string;
                                fullName: string | null;
                                phone: string | null;
                                /** @enum {string} */
                                role: "CUSTOMER" | "MERCHANT" | "COURIER" | "DISPATCHER" | "ADMIN";
                                /** @enum {string} */
                                status: "ACTIVE";
                                emailVerified: boolean;
                                profileComplete: boolean;
                            };
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/refresh": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** refresh */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": Record<string, never>;
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** @enum {string} */
                            state: "authenticated";
                            accessToken: string;
                            /** @enum {string} */
                            tokenType: "Bearer";
                            /** @enum {number} */
                            expiresIn: 900;
                            user: {
                                id: number;
                                /** Format: email */
                                email: string;
                                fullName: string | null;
                                phone: string | null;
                                /** @enum {string} */
                                role: "CUSTOMER" | "MERCHANT" | "COURIER" | "DISPATCHER" | "ADMIN";
                                /** @enum {string} */
                                status: "ACTIVE";
                                emailVerified: boolean;
                                profileComplete: boolean;
                            };
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** logout */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": Record<string, never>;
                };
            };
            responses: {
                /** @description Success */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/logout-all": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** logout-all */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": Record<string, never>;
                };
            };
            responses: {
                /** @description Success */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** me */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: number;
                            /** Format: email */
                            email: string;
                            fullName: string | null;
                            phone: string | null;
                            /** @enum {string} */
                            role: "CUSTOMER" | "MERCHANT" | "COURIER" | "DISPATCHER" | "ADMIN";
                            /** @enum {string} */
                            status: "ACTIVE";
                            emailVerified: boolean;
                            profileComplete: boolean;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/merchant/register": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** /api/v1/merchant/register */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        fullName: string;
                        /** Format: email */
                        email: string;
                        phone: string;
                        password: string;
                        businessName: string;
                    };
                };
            };
            responses: {
                /** @description Success */
                202: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/merchants": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** /api/v1/admin/merchants */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: {
                                /** Format: uuid */
                                id: string;
                                userId: number;
                                /** Format: email */
                                email: string;
                                fullName: string;
                                phone: string;
                                businessName: string;
                                /** @enum {string} */
                                status: "PENDING" | "APPROVED" | "REJECTED";
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                reviewedAt: string | null;
                            }[];
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/merchants/{id}/review": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** /api/v1/admin/merchants/{id}/review */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "APPROVED" | "REJECTED";
                    };
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            userId: number;
                            /** Format: email */
                            email: string;
                            fullName: string;
                            phone: string;
                            businessName: string;
                            /** @enum {string} */
                            status: "PENDING" | "APPROVED" | "REJECTED";
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            reviewedAt: string | null;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/merchant/clients": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** /api/v1/merchant/clients */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: {
                                /** Format: uuid */
                                id: string;
                                clientId: string;
                                name: string;
                                scopes: ("orders:read" | "orders:write")[];
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                rotatedAt: string | null;
                                /** Format: date-time */
                                revokedAt: string | null;
                            }[];
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        /** /api/v1/merchant/clients */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        name: string;
                        scopes: ("orders:read" | "orders:write")[];
                    };
                };
            };
            responses: {
                /** @description Success */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            client: {
                                /** Format: uuid */
                                id: string;
                                clientId: string;
                                name: string;
                                scopes: ("orders:read" | "orders:write")[];
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                rotatedAt: string | null;
                                /** Format: date-time */
                                revokedAt: string | null;
                            };
                            clientSecret: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/merchant/clients/{id}/rotate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** /api/v1/merchant/clients/{id}/rotate */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            client: {
                                /** Format: uuid */
                                id: string;
                                clientId: string;
                                name: string;
                                scopes: ("orders:read" | "orders:write")[];
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                rotatedAt: string | null;
                                /** Format: date-time */
                                revokedAt: string | null;
                            };
                            clientSecret: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/merchant/clients/{id}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** /api/v1/merchant/clients/{id}/revoke */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/merchant/webhook": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** /api/v1/merchant/webhook */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            configured: boolean;
                            /** Format: uri */
                            url: string | null;
                            /** Format: date-time */
                            updatedAt: string | null;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        /** /api/v1/merchant/webhook */
        put: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: uri */
                        url: string;
                    };
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            settings: {
                                configured: boolean;
                                /** Format: uri */
                                url: string | null;
                                /** Format: date-time */
                                updatedAt: string | null;
                            };
                            signingSecret: string | null;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/merchant/webhook/rotate-secret": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** /api/v1/merchant/webhook/rotate-secret */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": Record<string, never>;
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            signingSecret: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/quotes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** /api/v1/quotes */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        originDistrict: string;
                        destinationDistrict: string;
                        weightGrams: number;
                        lengthMm: number;
                        widthMm: number;
                        heightMm: number;
                    };
                };
            };
            responses: {
                /** @description Success */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            originDistrict: string;
                            destinationDistrict: string;
                            weightGrams: number;
                            lengthMm: number;
                            widthMm: number;
                            heightMm: number;
                            /** Format: uuid */
                            id: string;
                            feeCents: number;
                            /** @enum {string} */
                            currency: "LKR";
                            /** Format: date-time */
                            expiresAt: string;
                            originTown: string;
                            destinationTown: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/parcels": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** /api/v1/parcels */
        get: {
            parameters: {
                query?: {
                    cursor?: string;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: {
                                /** Format: uuid */
                                id: string;
                                trackingNumber: string;
                                /** @enum {string} */
                                status: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
                                feeCents: number;
                                /** @enum {string} */
                                currency: "LKR";
                                weightGrams: number;
                                lengthMm: number;
                                widthMm: number;
                                heightMm: number;
                                originTown: string;
                                destinationTown: string;
                                recipientName: string;
                                recipientPhone: string;
                                recipientAddress: string;
                                /** Format: date-time */
                                createdAt: string;
                                history: {
                                    /** @enum {string} */
                                    status: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
                                    town: string;
                                    /** Format: date-time */
                                    createdAt: string;
                                }[];
                            }[];
                            nextCursor: string | null;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        /** /api/v1/parcels */
        post: {
            parameters: {
                query?: never;
                header: {
                    "Idempotency-Key": string;
                };
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** Format: uuid */
                        quoteId: string;
                        recipientName: string;
                        recipientPhone: string;
                        recipientAddress: string;
                    };
                };
            };
            responses: {
                /** @description Success */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            trackingNumber: string;
                            /** @enum {string} */
                            status: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
                            feeCents: number;
                            /** @enum {string} */
                            currency: "LKR";
                            weightGrams: number;
                            lengthMm: number;
                            widthMm: number;
                            heightMm: number;
                            originTown: string;
                            destinationTown: string;
                            recipientName: string;
                            recipientPhone: string;
                            recipientAddress: string;
                            /** Format: date-time */
                            createdAt: string;
                            history: {
                                /** @enum {string} */
                                status: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
                                town: string;
                                /** Format: date-time */
                                createdAt: string;
                            }[];
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/parcels/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** /api/v1/parcels/{id} */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            id: string;
                            trackingNumber: string;
                            /** @enum {string} */
                            status: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
                            feeCents: number;
                            /** @enum {string} */
                            currency: "LKR";
                            weightGrams: number;
                            lengthMm: number;
                            widthMm: number;
                            heightMm: number;
                            originTown: string;
                            destinationTown: string;
                            recipientName: string;
                            recipientPhone: string;
                            recipientAddress: string;
                            /** Format: date-time */
                            createdAt: string;
                            history: {
                                /** @enum {string} */
                                status: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
                                town: string;
                                /** Format: date-time */
                                createdAt: string;
                            }[];
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/parcels/{id}/receipt": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** /api/v1/parcels/{id}/receipt */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            receiptReference: string;
                            /** Format: uri */
                            downloadUrl: string;
                            /** Format: date-time */
                            expiresAt: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/track/{trackingNumber}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** /api/v1/track/{trackingNumber} */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    trackingNumber: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            trackingNumber: string;
                            /** @enum {string} */
                            status: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
                            originTown: string;
                            destinationTown: string;
                            history: {
                                /** @enum {string} */
                                status: "CREATED" | "PICKED_UP" | "IN_TRANSIT" | "OUT_FOR_DELIVERY" | "DELIVERED" | "FAILED" | "CANCELLED";
                                town: string;
                                /** Format: date-time */
                                createdAt: string;
                            }[];
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/zones": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** /api/v1/admin/zones */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: number;
                            district: string;
                            town: string;
                            active: boolean;
                        }[];
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        /** /api/v1/admin/zones */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        district: string;
                        town: string;
                        /** @default true */
                        active?: boolean;
                    };
                };
            };
            responses: {
                /** @description Success */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: number;
                            district: string;
                            town: string;
                            active: boolean;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/zones/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /** /api/v1/admin/zones/{id} */
        delete: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                204: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content?: never;
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        options?: never;
        head?: never;
        /** /api/v1/admin/zones/{id} */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        district: string;
                        town: string;
                        /** @default true */
                        active?: boolean;
                    };
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: number;
                            district: string;
                            town: string;
                            active: boolean;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/admin/pricing": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** /api/v1/admin/pricing */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: number;
                            originZoneId: number;
                            destinationZoneId: number;
                            baseCents: number;
                            perExtraKgCents: number;
                            /** Format: date-time */
                            effectiveFrom: string;
                            /** Format: date-time */
                            createdAt?: string;
                        }[];
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        /** /api/v1/admin/pricing */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        originZoneId: number;
                        destinationZoneId: number;
                        baseCents: number;
                        perExtraKgCents: number;
                        /** Format: date-time */
                        effectiveFrom: string;
                    };
                };
            };
            responses: {
                /** @description Success */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: number;
                            originZoneId: number;
                            destinationZoneId: number;
                            baseCents: number;
                            perExtraKgCents: number;
                            /** Format: date-time */
                            effectiveFrom: string;
                            /** Format: date-time */
                            createdAt?: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/reports/daily": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** /api/v1/admin/reports/daily */
        get: {
            parameters: {
                query?: {
                    from?: string;
                    to?: string;
                    format?: "json" | "csv";
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            from: string;
                            to: string;
                            totalBooked: number;
                            totalDelivered: number;
                            totalFailed: number;
                            overallSuccessRatePercent: number;
                            days: {
                                date: string;
                                totalBooked: number;
                                totalDelivered: number;
                                totalFailed: number;
                                totalInTransit: number;
                                successRatePercent: number;
                            }[];
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/assistant/chat": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** /api/v1/assistant/chat */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        message: string;
                        history?: {
                            /** @enum {string} */
                            role: "user" | "assistant";
                            content: string;
                        }[];
                    };
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            reply: string;
                            toolsUsed: string[];
                            data?: {
                                [key: string]: unknown;
                            };
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/internal/v1/notifications/events/{eventId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Look up booking contacts for a persisted parcel.created event */
        get: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    eventId: string;
                };
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Booking contact lookup */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            /** Format: uuid */
                            eventId: string;
                            /** Format: uuid */
                            parcelId: string;
                            trackingNumber: string;
                            /** Format: email */
                            customerEmail: string;
                            recipientName: string;
                            recipientPhone: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/users": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** /api/v1/admin/users */
        get: {
            parameters: {
                query?: {
                    role?: "CUSTOMER" | "MERCHANT" | "COURIER" | "DISPATCHER" | "ADMIN";
                    status?: "INVITED" | "ACTIVE" | "SUSPENDED";
                    cursor?: string;
                    limit?: number;
                };
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody?: never;
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            items: {
                                id: number;
                                /** Format: email */
                                email: string;
                                fullName: string | null;
                                phone: string | null;
                                /** @enum {string} */
                                role: "CUSTOMER" | "MERCHANT" | "COURIER" | "DISPATCHER" | "ADMIN";
                                /** @enum {string} */
                                status: "INVITED" | "ACTIVE" | "SUSPENDED";
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                invitationExpiresAt: string | null;
                            }[];
                            nextCursor: string | null;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        put?: never;
        /** /api/v1/admin/users */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        fullName: string;
                        /** Format: email */
                        email: string;
                        phone: string;
                        /** @enum {string} */
                        role: "COURIER" | "DISPATCHER";
                    };
                };
            };
            responses: {
                /** @description Success */
                201: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                id: number;
                                /** Format: email */
                                email: string;
                                fullName: string;
                                phone: string;
                                /** @enum {string} */
                                role: "COURIER" | "DISPATCHER";
                                /** @enum {string} */
                                status: "INVITED" | "ACTIVE" | "SUSPENDED";
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                invitationExpiresAt: string | null;
                            };
                            /** @enum {string} */
                            delivery: "sent" | "failed" | "not_sent";
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/admin/users/{id}/status": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /** /api/v1/admin/users/{id}/status */
        patch: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        status: "ACTIVE" | "SUSPENDED";
                    };
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            id: number;
                            /** Format: email */
                            email: string;
                            fullName: string | null;
                            phone: string | null;
                            /** @enum {string} */
                            role: "CUSTOMER" | "MERCHANT" | "COURIER" | "DISPATCHER" | "ADMIN";
                            /** @enum {string} */
                            status: "INVITED" | "ACTIVE" | "SUSPENDED";
                            /** Format: date-time */
                            createdAt: string;
                            /** Format: date-time */
                            invitationExpiresAt: string | null;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        trace?: never;
    };
    "/api/v1/admin/users/{id}/invitation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** /api/v1/admin/users/{id}/invitation */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path: {
                    id: string;
                };
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        /** @enum {string} */
                        action: "resend" | "revoke";
                    };
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            user: {
                                id: number;
                                /** Format: email */
                                email: string;
                                fullName: string;
                                phone: string;
                                /** @enum {string} */
                                role: "COURIER" | "DISPATCHER";
                                /** @enum {string} */
                                status: "INVITED" | "ACTIVE" | "SUSPENDED";
                                /** Format: date-time */
                                createdAt: string;
                                /** Format: date-time */
                                invitationExpiresAt: string | null;
                            };
                            /** @enum {string} */
                            delivery: "sent" | "failed" | "not_sent";
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/auth/accept-invite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** /api/v1/auth/accept-invite */
        post: {
            parameters: {
                query?: never;
                header?: never;
                path?: never;
                cookie?: never;
            };
            requestBody: {
                content: {
                    "application/json": {
                        token: string;
                        password: string;
                    };
                };
            };
            responses: {
                /** @description Success */
                200: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/json": {
                            message: string;
                        };
                    };
                };
                /** @description Request rejected */
                400: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                401: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                403: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                404: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                409: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                410: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                413: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                415: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                422: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                429: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
                /** @description Request rejected */
                503: {
                    headers: {
                        [name: string]: unknown;
                    };
                    content: {
                        "application/problem+json": {
                            type: string;
                            title: string;
                            status: number;
                            detail: string;
                            code: string;
                            correlationId: string;
                            errors?: {
                                [key: string]: string[];
                            };
                        };
                    };
                };
            };
        };
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: never;
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export type operations = Record<string, never>;
