export interface paths {
    "/v1/contacts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * contacts (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_contacts"];
        put?: never;
        /**
         * upsert (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_upsert"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/contacts/import": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * csv (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_csv"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/contacts/import/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * importPreview (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_importPreview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/contact-lists": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * contactLists (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_contactLists"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/template-preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * draftPreview (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_draftPreview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/contacts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * contact (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_contact"];
        put?: never;
        post?: never;
        /**
         * remove (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        delete: operations["AudienceController_remove"];
        options?: never;
        head?: never;
        /**
         * update (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["AudienceController_update"];
        trace?: never;
    };
    "/v1/contacts/{id}/preferences": {
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
        /**
         * preferences (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["AudienceController_preferences"];
        trace?: never;
    };
    "/v1/contacts/{id}/preference-link": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * link (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_link"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/contact-properties": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * properties (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_properties"];
        put?: never;
        /**
         * property (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_property"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/audience-segments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * segments (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_segments"];
        put?: never;
        /**
         * createSegment (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_createSegment"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/audience-segments/{id}": {
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
        /**
         * segment (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["AudienceController_segment"];
        trace?: never;
    };
    "/v1/audience-topics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * topics (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_topics"];
        put?: never;
        /**
         * createTopic (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_createTopic"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/audience-topics/{id}": {
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
        /**
         * topic (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["AudienceController_topic"];
        trace?: never;
    };
    "/v1/templates": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * templates (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_templates"];
        put?: never;
        /**
         * createTemplate (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_createTemplate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/templates/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * template (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_template"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/templates/{id}/versions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * version (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_version"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/templates/{id}/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * preview (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_preview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/broadcasts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * broadcasts (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_broadcasts"];
        put?: never;
        /**
         * createBroadcast (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_createBroadcast"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/broadcasts/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * broadcast (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_broadcast"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * editBroadcast (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["AudienceController_editBroadcast"];
        trace?: never;
    };
    "/v1/broadcasts/{id}/audience-preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * campaignAudience (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_campaignAudience"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/broadcasts/{id}/preflight": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * preflight (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_preflight"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/broadcasts/{id}/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * testEmail (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_testEmail"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/broadcasts/{id}/schedule": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * schedule (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_schedule"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/broadcasts/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * cancel (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/preferences/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * publicPreferences (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AudienceController_publicPreferences"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * publicUpdate (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["AudienceController_publicUpdate"];
        trace?: never;
    };
    "/v1/preferences/{token}/unsubscribe": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * oneClick (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AudienceController_oneClick"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/config": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * configuration (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AuthController_configuration"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/login": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * login (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AuthController_login"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * logout (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AuthController_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/me": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * me (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AuthController_me"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/mfa/setup": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * mfaSetup (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AuthController_mfaSetup"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/mfa/enable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * mfaEnable (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AuthController_mfaEnable"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/mfa/disable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * mfaDisable (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AuthController_mfaDisable"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/oidc": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * oidcStart (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AuthController_oidcStart"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/oidc/callback": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * oidcCallback (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AuthController_oidcCallback"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/exchange": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * exchange (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AuthController_exchange"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/auth/accept-invite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * acceptInvite (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AuthController_acceptInvite"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/automations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AutomationController_list"];
        put?: never;
        /**
         * create (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AutomationController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/automations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * detail (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AutomationController_detail"];
        /**
         * update (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        put: operations["AutomationController_update"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/automation-events": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * event (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AutomationController_event"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/automation-runs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * runs (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AutomationController_runs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/automation-runs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * run (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["AutomationController_run"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/automation-runs/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * cancel (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["AutomationController_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/browser-transfers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * issue (read)
         * @description Session-only, short-lived browser transfer grant bound to the organization, environment and exact operation. Send grants bind exact UTF-8 body bytes and idempotency key. Redemption requires the configured browser Origin and a live session. Tokens are returned only in this no-store response and must never be put in a URL.
         */
        post: operations["BrowserTransfersController_issue"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/layouts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["ContentController_list"];
        put?: never;
        /**
         * create (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["ContentController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/layouts/{identifier}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * detail (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["ContentController_detail"];
        /**
         * update (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        put: operations["ContentController_update"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/translations/{workflow}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * dictionaries (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["ContentController_dictionaries"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/translations/{workflow}/{locale}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * dictionary (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        put: operations["ContentController_dictionary"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/content/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * preview (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["ContentController_preview"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/dead-letters": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["DeadLettersController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/dead-letters/{kind}/{id}/redrive": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * redrive (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["DeadLettersController_redrive"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/environments": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * environments (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["IdentityController_environments"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/environments/{id}": {
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
        /**
         * updateEnvironment (manage_integrations)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["IdentityController_updateEnvironment"];
        trace?: never;
    };
    "/v1/api-keys": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * keys (manage_keys)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["IdentityController_keys"];
        put?: never;
        /**
         * createKey (manage_keys)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["IdentityController_createKey"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/api-keys/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * revokeKey (manage_keys)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        delete: operations["IdentityController_revokeKey"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/team": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * team (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["IdentityController_team"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/team/invites": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * invite (manage_team)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["IdentityController_invite"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/team/accept-invite": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * acceptExisting (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["IdentityController_acceptExisting"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/team/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * removeMember (manage_team)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        delete: operations["IdentityController_removeMember"];
        options?: never;
        head?: never;
        /**
         * role (manage_team)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["IdentityController_role"];
        trace?: never;
    };
    "/v1/audit-logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * auditLogs (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["IdentityController_auditLogs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inbound/postal/{domainId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * receive (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["InboundController_receive"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inbound": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["InboundController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inbound/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * detail (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["InboundController_detail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inbound/{id}/body": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * body (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["InboundController_body"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inbound/{id}/raw": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * raw (read)
         * @description Defaults to the compatible JSON/base64 response. Request format=binary for a bounded attachment download with Content-Disposition and no-store. Browser transfer grants select the exact binary target.
         */
        get: operations["InboundController_raw"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/inbound/{id}/attachments/{attachmentId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * attachment (read)
         * @description Defaults to the compatible JSON/base64 response. Request format=binary for a bounded attachment download with Content-Disposition and no-store. Browser transfer grants select the exact binary target.
         */
        get: operations["InboundController_attachment"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/forwarding-rules": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * rules (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["InboundController_rules"];
        put?: never;
        /**
         * createRule (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["InboundController_createRule"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/forwarding-rules/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * updateRule (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        put: operations["InboundController_updateRule"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/integrations/catalog": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * catalog (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["IntegrationController_catalog"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/integrations": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["IntegrationController_list"];
        put?: never;
        /**
         * create (manage_integrations)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["IntegrationController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/integrations/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        /**
         * toggle (manage_integrations)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        put: operations["IntegrationController_toggle"];
        post?: never;
        /**
         * remove (manage_integrations)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        delete: operations["IntegrationController_remove"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/events/postal": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * postal (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["MailEventController_postal"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/events/postal/{instanceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * postal (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["MailEventController_postal_instance"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/events/sns": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * sns (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["MailEventController_sns"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/events/sns/{instanceId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * sns (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["MailEventController_sns_instance"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/t/{token}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * track (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["MailEventController_track"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/email-capabilities": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * capabilities (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["MailController_capabilities"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/sending-policy": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * sendingPolicy (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["MailController_sendingPolicy"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/emails": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["MailController_list"];
        put?: never;
        /**
         * send (send)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["MailController_send"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/emails/batch": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * batch (send)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["MailController_batch"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/emails/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * get (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["MailController_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * reschedule (send)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["MailController_reschedule"];
        trace?: never;
    };
    "/v1/emails/{id}/source": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * source (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["MailController_source"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/emails/{id}/cancel": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * cancel (send)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["MailController_cancel"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/domains": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * domains (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["MailController_domains"];
        put?: never;
        /**
         * createDomain (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["MailController_createDomain"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/domains/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * domain (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["MailController_domain"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * updateDomain (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["MailController_updateDomain"];
        trace?: never;
    };
    "/v1/domains/{id}/verify": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * verify (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["MailController_verify"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/suppressions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * suppressions (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["MailController_suppressions"];
        put?: never;
        /**
         * suppress (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["MailController_suppress"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/suppressions/{email}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * unsuppress (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        delete: operations["MailController_unsuppress"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/metrics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * metrics (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["MetricsController_metrics"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * endpoints (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperationsController_endpoints"];
        put?: never;
        /**
         * createEndpoint (manage_integrations)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["OperationsController_createEndpoint"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks/{id}": {
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
        /**
         * updateEndpoint (manage_integrations)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["OperationsController_updateEndpoint"];
        trace?: never;
    };
    "/v1/webhooks/{id}/rotate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * rotate (manage_integrations)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["OperationsController_rotate"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhooks/{id}/test": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * testEndpoint (manage_integrations)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["OperationsController_testEndpoint"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhook-deliveries": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * deliveries (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperationsController_deliveries"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhook-deliveries/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * delivery (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperationsController_delivery"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/webhook-deliveries/{id}/replay": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * replay (manage_integrations)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["OperationsController_replay"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operation-alerts": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * alerts (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperationsController_alerts"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/logs": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * logs (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperationsController_logs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/logs/export": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * exportLogs (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperationsController_exportLogs"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/logs/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * log (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperationsController_log"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/events/novu/{environment}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * engineEvent (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["OperationsController_engineEvent"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operator/organizations/{orgId}/domains/{domainId}/evidence": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperatorReadinessController_list"];
        put?: never;
        /**
         * record (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["OperatorReadinessController_record"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operator/organizations/{orgId}/domains/{domainId}/evidence/{instanceId}/revoke": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * revoke (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["OperatorReadinessController_revoke"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operator/mail-routes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * routes (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperatorController_routes"];
        put?: never;
        /**
         * createRoute (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["OperatorController_createRoute"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operator/mail-routes/{id}/{revision}/disable": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * disableRoute (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["OperatorController_disableRoute"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operator/logout": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * logout (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["OperatorController_logout"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operator/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * session (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperatorController_session"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operator/step-up": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * stepUp (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["OperatorController_stepUp"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operator/sending-policies": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * policies (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperatorController_policies"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operator/sending-policies/{orgId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * policy (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperatorController_policy"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        /**
         * update (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["OperatorController_update"];
        trace?: never;
    };
    "/v1/operator/sending-policies/{orgId}/audit": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * audit (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["OperatorController_audit"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operator/sending-policies/{orgId}/restore-suppression": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * restore (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["OperatorController_restore"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/operator/organizations/{orgId}/credentials/{keyId}": {
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
        /**
         * credential (operator)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        patch: operations["OperatorController_credential"];
        trace?: never;
    };
    "/v1/publish/diff": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * diff (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["PublicationController_diff"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/publish": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * create (publish)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["PublicationController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/publications": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["PublicationController_list"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/publications/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * detail (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["PublicationController_detail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/publications/{id}/retry": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * retry (publish)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["PublicationController_retry"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/workflows": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * list (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["WorkflowController_list"];
        put?: never;
        /**
         * create (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["WorkflowController_create"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/workflows/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * get (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["WorkflowController_get"];
        /**
         * update (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        put: operations["WorkflowController_update"];
        post?: never;
        /**
         * remove (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        delete: operations["WorkflowController_remove"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/events/trigger": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * trigger (send)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["WorkflowController_trigger"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/events/trigger/bulk": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * bulk (send)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["WorkflowController_bulk"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/events/trigger/{transactionId}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        post?: never;
        /**
         * cancel (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        delete: operations["WorkflowController_cancel"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/activity": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * activity (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["WorkflowController_activity"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/activity/reconciliation": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * reconciliation (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["WorkflowController_reconciliation"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/activity/{id}/inspection": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * inspection (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["WorkflowController_inspection"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/activity/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * activityDetail (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["WorkflowController_activityDetail"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/subscribers": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * subscribers (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["WorkflowController_subscribers"];
        put?: never;
        /**
         * subscriber (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["WorkflowController_subscriber"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/subscribers/{id}": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * getSubscriber (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["WorkflowController_getSubscriber"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/subscribers/{id}/preferences": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * preferences (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["WorkflowController_preferences"];
        /**
         * setPreferences (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        put: operations["WorkflowController_setPreferences"];
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/subscribers/{id}/inbox-token": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * inbox (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["WorkflowController_inbox"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/topics": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /**
         * topics (read)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        get: operations["WorkflowController_topics"];
        put?: never;
        /**
         * topic (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["WorkflowController_topic"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/v1/topics/{key}/subscriptions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /**
         * subscribe (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        post: operations["WorkflowController_subscribe"];
        /**
         * unsubscribe (write)
         * @description Validated inputs may have additional semantic constraints documented in the resource guide.
         */
        delete: operations["WorkflowController_unsubscribe"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        Error: {
            message?: string | string[] | {
                [key: string]: unknown;
            };
            statusCode?: number;
            errors?: {
                [key: string]: unknown;
            };
            code?: string;
        } & {
            [key: string]: unknown;
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
    AudienceController_contacts: {
        parameters: {
            query?: {
                page?: number;
                limit?: number;
                q?: string;
                segment_id?: string;
                list_id?: string;
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: ({
                            id: string;
                            org_id?: string;
                            environment_id?: string;
                            created_at: string;
                            email: string;
                            first_name: string | null;
                            last_name: string | null;
                            properties: {
                                [key: string]: unknown;
                            };
                            unsubscribed: boolean;
                        } & {
                            [key: string]: unknown;
                        })[];
                        page?: number;
                        limit?: number;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_upsert: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    first_name?: string;
                    last_name?: string;
                    properties?: {
                        [key: string]: string | number | boolean | ("null" | null);
                    };
                    unsubscribed?: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_csv: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    csv: string;
                    mapping: {
                        [key: string]: string;
                    };
                } | {
                    source: {
                        /** @enum {string} */
                        format: "csv" | "tsv" | "json" | "xlsx";
                        data: string;
                        sheet?: string;
                    };
                    mapping: {
                        [key: string]: string;
                    };
                    /** Format: uuid */
                    list_id?: string;
                    list_name?: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        imported: number;
                        duplicates: number;
                        created?: number;
                        updated?: number;
                        skipped_deleted?: number;
                        /** Format: uuid */
                        list_id?: string | null;
                        list_name?: string | null;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_importPreview: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    csv: string;
                } | {
                    source: {
                        /** @enum {string} */
                        format: "csv" | "tsv" | "json" | "xlsx";
                        data: string;
                        sheet?: string;
                    };
                    mapping?: {
                        [key: string]: string;
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        headers: string[];
                        sample: string[][];
                        rows: number;
                        sheets?: string[];
                        sheet?: string;
                        validation?: {
                            valid: number;
                            duplicates: number;
                            errors: ({
                                row: number;
                                message: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                            error_count: number;
                            existing: number;
                            skipped_deleted: number;
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_contactLists: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": ({
                        id: string;
                        org_id?: string;
                        environment_id?: string;
                        created_at: string;
                        name: string;
                        updated_at: string;
                        contact_count: number;
                    } & {
                        [key: string]: unknown;
                    })[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_draftPreview: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    content: {
                        subject: string;
                        html: string;
                        text?: string;
                        variables?: {
                            [key: string]: string | number | boolean | ("null" | null);
                        };
                    };
                    variables?: {
                        [key: string]: unknown;
                    };
                    /** Format: uuid */
                    contact_id?: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        subject: string;
                        html: string;
                        text: string | null;
                        missing_variables: string[];
                        missing_variable_count: number;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_contact: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_remove: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_update: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    first_name?: string;
                    last_name?: string;
                    properties?: {
                        [key: string]: string | number | boolean | ("null" | null);
                    };
                    unsubscribed?: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_preferences: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    unsubscribed?: boolean;
                    topics?: {
                        [key: string]: boolean;
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_link: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_properties: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_property: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @enum {string} */
                    type: "string" | "number" | "boolean" | "date";
                    fallback?: string | number | boolean | ("null" | null);
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_segments: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_createSegment: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    definition: {
                        /** @enum {string} */
                        mode?: "all" | "any";
                        rules: {
                            field: string;
                            /** @enum {string} */
                            op: "eq" | "neq" | "contains" | "gt" | "lt" | "exists";
                            value?: string | number | boolean | ("null" | null);
                        }[];
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_segment: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    definition: {
                        /** @enum {string} */
                        mode?: "all" | "any";
                        rules: {
                            field: string;
                            /** @enum {string} */
                            op: "eq" | "neq" | "contains" | "gt" | "lt" | "exists";
                            value?: string | number | boolean | ("null" | null);
                        }[];
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_topics: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_createTopic: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    description?: string;
                    default_opt_in?: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_topic: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    description?: string;
                    default_opt_in?: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_templates: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_createTemplate: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    subject: string;
                    html: string;
                    text?: string;
                    variables?: {
                        [key: string]: string | number | boolean | ("null" | null);
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_template: {
        parameters: {
            query?: {
                version?: number;
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_version: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    subject: string;
                    html: string;
                    text?: string;
                    variables?: {
                        [key: string]: string | number | boolean | ("null" | null);
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_preview: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    version?: number;
                    variables?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_broadcasts: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_createBroadcast: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
                /** @description Optional campaign creation key, retained with the campaign in this environment. Identical retries return the existing draft; different content returns 409. */
                "Idempotency-Key"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    sender: string;
                    /** Format: uuid */
                    template_id?: string;
                    template_version?: number;
                    content?: {
                        subject: string;
                        html: string;
                        text?: string;
                        variables?: {
                            [key: string]: string | number | boolean | ("null" | null);
                        };
                    };
                    /** Format: uuid */
                    list_id?: string | null;
                    /** Format: uuid */
                    segment_id?: string | null;
                    /** Format: uuid */
                    topic_id?: string | null;
                    rate_per_second?: number;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_broadcast: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_editBroadcast: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    sender: string;
                    /** Format: uuid */
                    template_id?: string;
                    template_version?: number;
                    content?: {
                        subject: string;
                        html: string;
                        text?: string;
                        variables?: {
                            [key: string]: string | number | boolean | ("null" | null);
                        };
                    };
                    /** Format: uuid */
                    list_id?: string | null;
                    /** Format: uuid */
                    segment_id?: string | null;
                    /** Format: uuid */
                    topic_id?: string | null;
                    rate_per_second?: number;
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_campaignAudience: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        total: number;
                        eligible: number;
                        excluded: {
                            unsubscribed: number;
                            suppressed: number;
                            topic_opt_out: number;
                            deleted: number;
                        } & {
                            [key: string]: unknown;
                        };
                        sample: ({
                            id: string;
                            email: string;
                            first_name: string;
                            last_name: string;
                        } & {
                            [key: string]: unknown;
                        })[];
                        snapshot: boolean;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_preflight: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        revision: string;
                        sandbox: boolean;
                        checked_at: string;
                        ready: boolean;
                        can_test: boolean;
                        checks: ({
                            id: string;
                            /** @enum {string} */
                            status: "pass" | "warning" | "blocked";
                            message: string;
                            href: string;
                            code?: string;
                        } & {
                            [key: string]: unknown;
                        })[];
                        quota: {
                            remaining: number;
                            daily_limit: number;
                            per_minute_limit: number;
                        } & {
                            [key: string]: unknown;
                        };
                        audience: ({
                            total: number;
                            eligible: number;
                            excluded: {
                                unsubscribed: number;
                                suppressed: number;
                                topic_opt_out: number;
                                deleted: number;
                            } & {
                                [key: string]: unknown;
                            };
                            sample: ({
                                id: string;
                                email: string;
                                first_name: string;
                                last_name: string;
                            } & {
                                [key: string]: unknown;
                            })[];
                            snapshot: boolean;
                        } & {
                            [key: string]: unknown;
                        }) | null;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_testEmail: {
        parameters: {
            query?: never;
            header: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
                /** @description Required test intent. Identical retries return the same IDs for 24 hours; different content returns 409. Tests use normal sending policy and never fan out to the audience. */
                "Idempotency-Key": string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    sandbox: boolean;
                    revision: string;
                    recipients: string[];
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: ({
                            id: string;
                            status: string;
                        } & {
                            [key: string]: unknown;
                        })[];
                        sandbox: boolean;
                        template_version: number;
                        revision: string;
                        replay_until: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_schedule: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    scheduled_at?: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_cancel: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_publicPreferences: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_publicUpdate: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    unsubscribed?: boolean;
                    topics?: {
                        [key: string]: boolean;
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AudienceController_oneClick: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    "List-Unsubscribe": "One-Click";
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AuthController_configuration: {
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AuthController_login: {
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
                    code?: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AuthController_logout: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AuthController_me: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AuthController_mfaSetup: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AuthController_mfaEnable: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AuthController_mfaDisable: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    password: string;
                    code: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AuthController_oidcStart: {
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AuthController_oidcCallback: {
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AuthController_exchange: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code: string;
                    mfa_code?: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AuthController_acceptInvite: {
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
                    name: string;
                    password: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AutomationController_list: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AutomationController_create: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    identifier: string;
                    name: string;
                    enabled?: boolean;
                    definition: {
                        trigger: string;
                        entry: string;
                        steps: ({
                            id: string;
                            name: string;
                            /** @enum {string} */
                            type: "send_email";
                            from: string;
                            /** Format: uuid */
                            template_id: string;
                            template_version: number;
                            next: string | null;
                        } | {
                            id: string;
                            name: string;
                            /** @enum {string} */
                            type: "wait";
                            seconds: number;
                            next: string | null;
                        } | {
                            id: string;
                            name: string;
                            /** @enum {string} */
                            type: "wait_for_event";
                            event: string;
                            timeout_seconds: number;
                            next: string | null;
                            on_timeout: string | null;
                        } | {
                            id: string;
                            name: string;
                            /** @enum {string} */
                            type: "condition";
                            condition: unknown;
                            then: string | null;
                            else: string | null;
                        })[];
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AutomationController_detail: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AutomationController_update: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    identifier: string;
                    name: string;
                    enabled?: boolean;
                    definition: {
                        trigger: string;
                        entry: string;
                        steps: ({
                            id: string;
                            name: string;
                            /** @enum {string} */
                            type: "send_email";
                            from: string;
                            /** Format: uuid */
                            template_id: string;
                            template_version: number;
                            next: string | null;
                        } | {
                            id: string;
                            name: string;
                            /** @enum {string} */
                            type: "wait";
                            seconds: number;
                            next: string | null;
                        } | {
                            id: string;
                            name: string;
                            /** @enum {string} */
                            type: "wait_for_event";
                            event: string;
                            timeout_seconds: number;
                            next: string | null;
                            on_timeout: string | null;
                        } | {
                            id: string;
                            name: string;
                            /** @enum {string} */
                            type: "condition";
                            condition: unknown;
                            then: string | null;
                            else: string | null;
                        })[];
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AutomationController_event: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    contact_id: string;
                    name: string;
                    external_id: string;
                    data?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AutomationController_runs: {
        parameters: {
            query?: {
                automation_id?: string;
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AutomationController_run: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    AutomationController_cancel: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    BrowserTransfersController_issue: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    operation: "email.send";
                    body_sha256: string;
                    body_bytes: number;
                    idempotency_key: string;
                } | {
                    /** @enum {string} */
                    operation: "email.detail";
                    /** Format: uuid */
                    message_id: string;
                } | {
                    /** @enum {string} */
                    operation: "email.source";
                    /** Format: uuid */
                    message_id: string;
                } | {
                    /** @enum {string} */
                    operation: "inbound.body";
                    /** Format: uuid */
                    message_id: string;
                } | {
                    /** @enum {string} */
                    operation: "inbound.raw";
                    /** Format: uuid */
                    message_id: string;
                } | {
                    /** @enum {string} */
                    operation: "inbound.attachment";
                    /** Format: uuid */
                    message_id: string;
                    /** Format: uuid */
                    attachment_id: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        /** Format: uri */
                        url: string;
                        /** @enum {string} */
                        method: "GET" | "POST";
                        token: string;
                        /** Format: date-time */
                        expires_at: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    ContentController_list: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": ({
                        id: string;
                        org_id?: string;
                        environment_id?: string;
                        created_at: string;
                        identifier: string;
                        name: string;
                        current_version: number;
                        html: string;
                        translations: boolean;
                    } & {
                        [key: string]: unknown;
                    })[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    ContentController_create: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    identifier: string;
                    name: string;
                    html: string;
                    translations?: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    ContentController_detail: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                identifier: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    ContentController_update: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                identifier: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    identifier: string;
                    name: string;
                    html: string;
                    translations?: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    ContentController_dictionaries: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                workflow: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": ({
                        locale: string;
                        current_version: number;
                        entries: {
                            [key: string]: string;
                        };
                    } & {
                        [key: string]: unknown;
                    })[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    ContentController_dictionary: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                workflow: string;
                locale: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    [key: string]: string;
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        locale: string;
                        version: number;
                        entries: {
                            [key: string]: string;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    ContentController_preview: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    workflow: {
                        workflowId: string;
                        name: string;
                        description?: string;
                        tags?: string[];
                        /** @enum {string} */
                        severity?: "high" | "medium" | "low" | "none";
                        active?: boolean;
                        critical?: boolean;
                        payloadSchema?: {
                            [key: string]: unknown;
                        };
                        defaults?: {
                            in_app?: boolean;
                            email?: boolean;
                            sms?: boolean;
                            push?: boolean;
                            chat?: boolean;
                        };
                        preferences?: {
                            in_app?: boolean;
                            email?: boolean;
                            sms?: boolean;
                            push?: boolean;
                            chat?: boolean;
                        };
                        steps: {
                            stepId: string;
                            name: string;
                            /** @enum {string} */
                            type: "in_app" | "email" | "sms" | "push" | "chat" | "delay" | "digest" | "throttle" | "http_request";
                            controlValues?: {
                                [key: string]: unknown;
                            };
                        }[];
                    };
                    locale?: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        definition: {
                            [key: string]: unknown;
                        };
                        resolved: {
                            [key: string]: unknown;
                        };
                        dependencies: {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    DeadLettersController_list: {
        parameters: {
            query?: {
                limit?: number;
                page?: number;
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: ({
                            id: string;
                            /** @enum {string} */
                            kind: "workflow" | "email" | "webhook" | "inbound" | "forward" | "automation" | "publication";
                            status: string;
                            error: string | null;
                            attempts: number;
                            created_at: string;
                            redrivable: boolean;
                        } & {
                            [key: string]: unknown;
                        })[];
                        page?: number;
                        limit?: number;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    DeadLettersController_redrive: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                kind: "workflow" | "email" | "webhook" | "inbound" | "forward" | "automation" | "publication";
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        kind: string;
                        status: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IdentityController_environments: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IdentityController_updateEnvironment: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    novu_api_key?: string;
                    novu_webhook_secret?: string;
                    novu_application_id?: string;
                    /** Format: uri */
                    bridge_url?: string | null;
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IdentityController_keys: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IdentityController_createKey: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** @enum {string} */
                    permission: "full_access" | "sending_access";
                    /** Format: uuid */
                    domain_id?: string;
                    allow_publish?: boolean;
                    rate_limit?: number;
                    rate_burst?: number;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IdentityController_revokeKey: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IdentityController_team: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IdentityController_invite: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    /** @enum {string} */
                    role: "admin" | "developer" | "viewer";
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IdentityController_acceptExisting: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IdentityController_removeMember: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IdentityController_role: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    role: "owner" | "admin" | "developer" | "viewer";
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IdentityController_auditLogs: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    InboundController_receive: {
        parameters: {
            query?: never;
            header: {
                /** @description Native Postal SHA-256 signature over the original body, verified against the configured public key. */
                "x-postal-signature-256": string;
                "x-postal-signature-kid"?: string;
            };
            path: {
                domainId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    id: string | number;
                    /** Format: email */
                    rcpt_to: string;
                    mail_from: "" | string;
                    message: string;
                    /** @enum {boolean} */
                    base64: true;
                    size: number;
                } & {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    InboundController_list: {
        parameters: {
            query?: {
                page?: number;
                limit?: number;
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: ({
                            id: string;
                            org_id?: string;
                            environment_id?: string;
                            created_at: string;
                            domain_id: string;
                            subject: string | null;
                            status: string;
                            mail_from: string;
                            rcpt_to: string;
                        } & {
                            [key: string]: unknown;
                        })[];
                        page?: number;
                        limit?: number;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    InboundController_detail: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        org_id?: string;
                        environment_id?: string;
                        created_at: string;
                        subject: string | null;
                        status: string;
                        mail_from: string;
                        rcpt_to: string;
                        attachments: {
                            [key: string]: unknown;
                        }[];
                        attempts: {
                            [key: string]: unknown;
                        }[];
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    InboundController_body: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        html?: string;
                        text?: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    InboundController_raw: {
        parameters: {
            query?: {
                format?: "binary" | "json";
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    /** @description Binary downloads use a safe attachment filename. */
                    "Content-Disposition"?: string;
                    /** @description Binary download responses are no-store. */
                    "Cache-Control"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        filename: string;
                        content: string;
                        content_type: string;
                    } & {
                        [key: string]: unknown;
                    };
                    "message/rfc822": string;
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    InboundController_attachment: {
        parameters: {
            query?: {
                format?: "binary" | "json";
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
                attachmentId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    /** @description Binary downloads use a safe attachment filename. */
                    "Content-Disposition"?: string;
                    /** @description Binary download responses are no-store. */
                    "Cache-Control"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        filename: string;
                        content: string;
                        content_type: string;
                    } & {
                        [key: string]: unknown;
                    };
                    "*/*": string;
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    InboundController_rules: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    InboundController_createRule: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    domain_id: string;
                    /** Format: email */
                    recipient?: string | null;
                    sender: string;
                    destinations: string[];
                    enabled?: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    InboundController_updateRule: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    domain_id: string;
                    /** Format: email */
                    recipient?: string | null;
                    sender: string;
                    destinations: string[];
                    enabled?: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IntegrationController_catalog: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IntegrationController_list: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IntegrationController_create: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    identifier: string;
                    name: string;
                    provider: string;
                    /** @enum {string} */
                    channel: "email" | "sms" | "push" | "chat" | "in_app";
                    credentials?: {
                        [key: string]: string;
                    };
                    active?: boolean;
                    primary?: boolean;
                    priority?: number;
                    conditions?: unknown;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IntegrationController_toggle: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    active: boolean;
                    primary?: boolean;
                    priority?: number;
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    IntegrationController_remove: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailEventController_postal: {
        parameters: {
            query?: never;
            header: {
                /** @description Native Postal SHA-256 signature over the original body, verified against the configured public key. */
                "x-postal-signature-256": string;
                "x-postal-signature-kid"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    event: string;
                    uuid: string;
                    payload: {
                        message?: {
                            token?: string;
                            message_id?: string;
                            to?: string;
                        } & {
                            [key: string]: unknown;
                        };
                        original_message?: {
                            token?: string;
                            message_id?: string;
                            to?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                } & {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailEventController_postal_instance: {
        parameters: {
            query?: never;
            header: {
                /** @description Native Postal SHA-256 signature over the original body, verified against the configured public key. */
                "x-postal-signature-256": string;
                "x-postal-signature-kid"?: string;
            };
            path: {
                instanceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    event: string;
                    uuid: string;
                    payload: {
                        message?: {
                            token?: string;
                            message_id?: string;
                            to?: string;
                        } & {
                            [key: string]: unknown;
                        };
                        original_message?: {
                            token?: string;
                            message_id?: string;
                            to?: string;
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                } & {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailEventController_sns: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
                    Message: string;
                    MessageId: string;
                    TopicArn: string;
                    Timestamp: string;
                    /** @enum {string} */
                    SignatureVersion: "1" | "2";
                    Signature: string;
                    /** Format: uri */
                    SigningCertURL: string;
                    Subject?: string;
                    Token?: string;
                    SubscribeURL?: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailEventController_sns_instance: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                instanceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** @enum {string} */
                    Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
                    Message: string;
                    MessageId: string;
                    TopicArn: string;
                    Timestamp: string;
                    /** @enum {string} */
                    SignatureVersion: "1" | "2";
                    Signature: string;
                    /** Format: uri */
                    SigningCertURL: string;
                    Subject?: string;
                    Token?: string;
                    SubscribeURL?: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailEventController_track: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                token: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_capabilities: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        attachment_max_bytes: number;
                        attachment_max_count: number;
                        mime_max_bytes: number;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_sendingPolicy: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        org_id?: string;
                        name: string;
                        /** @enum {string} */
                        state: "pending_review" | "approved" | "suspended";
                        revision: number;
                        daily_limit: number;
                        per_minute_limit: number;
                        complaint_threshold: number;
                        hard_bounce_rate: number;
                        hard_bounce_min: number;
                        marketing_enabled: boolean;
                        default_traffic_class: string | null;
                        trust_tier: string;
                        route_bindings: {
                            [key: string]: unknown;
                        };
                        suspension_reason: string | null;
                        reviewed_at: string | null;
                        updated_at: string;
                        usage: {
                            reserved: number;
                            sent_24h: number;
                        } & {
                            [key: string]: unknown;
                        };
                        feedback: {
                            recipients_24h: number;
                            hard_bounces: number;
                            complaints: number;
                            unknown: number;
                            latest_at: string | null;
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_list: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": ({
                        id: string;
                        domain_id: string;
                        from: string;
                        subject: string;
                        status: string;
                        scheduled_at: string;
                        next_attempt_at: string;
                        hold_reason: string | null;
                        traffic_class: string | null;
                        created_at: string;
                    } & {
                        [key: string]: unknown;
                    })[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_send: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
                /** @description 24-hour validated-request deduplication. Reusing a key with different content returns 409. */
                "Idempotency-Key"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    from: string;
                    /** @enum {string} */
                    traffic_class?: "transactional" | "marketing";
                    to: string | string[];
                    cc?: string | string[];
                    bcc?: string | string[];
                    reply_to?: string | string[];
                    subject?: string;
                    template?: {
                        /** Format: uuid */
                        id: string;
                        version?: number;
                        variables?: {
                            [key: string]: string | number | boolean | ("null" | null);
                        };
                    };
                    html?: string;
                    text?: string;
                    headers?: {
                        [key: string]: string;
                    };
                    attachments?: {
                        filename: string;
                        content?: string;
                        /** Format: uri */
                        path?: string;
                        content_type?: string;
                        content_id?: string;
                    }[];
                    tags?: {
                        name: string;
                        value: string;
                    }[];
                    scheduled_at?: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_batch: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
                /** @description 24-hour validated-request deduplication. Reusing a key with different content returns 409. */
                "Idempotency-Key"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    from: string;
                    /** @enum {string} */
                    traffic_class?: "transactional" | "marketing";
                    to: string | string[];
                    cc?: string | string[];
                    bcc?: string | string[];
                    reply_to?: string | string[];
                    subject?: string;
                    template?: {
                        /** Format: uuid */
                        id: string;
                        version?: number;
                        variables?: {
                            [key: string]: string | number | boolean | ("null" | null);
                        };
                    };
                    html?: string;
                    text?: string;
                    headers?: {
                        [key: string]: string;
                    };
                    attachments?: {
                        filename: string;
                        content?: string;
                        /** Format: uri */
                        path?: string;
                        content_type?: string;
                        content_id?: string;
                    }[];
                    tags?: {
                        name: string;
                        value: string;
                    }[];
                    scheduled_at?: string;
                }[] | {
                    emails: {
                        from: string;
                        /** @enum {string} */
                        traffic_class?: "transactional" | "marketing";
                        to: string | string[];
                        cc?: string | string[];
                        bcc?: string | string[];
                        reply_to?: string | string[];
                        subject?: string;
                        template?: {
                            /** Format: uuid */
                            id: string;
                            version?: number;
                            variables?: {
                                [key: string]: string | number | boolean | ("null" | null);
                            };
                        };
                        html?: string;
                        text?: string;
                        headers?: {
                            [key: string]: string;
                        };
                        attachments?: {
                            filename: string;
                            content?: string;
                            /** Format: uri */
                            path?: string;
                            content_type?: string;
                            content_id?: string;
                        }[];
                        tags?: {
                            name: string;
                            value: string;
                        }[];
                        scheduled_at?: string;
                    }[];
                    /** @enum {string} */
                    validation?: "strict" | "permissive";
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: ({
                            id: string;
                        } & {
                            [key: string]: unknown;
                        })[];
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_get: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        org_id?: string;
                        environment_id?: string;
                        created_at: string;
                        status: string;
                        request: {
                            [key: string]: unknown;
                        };
                        error: string | null;
                        next_attempt_at: string;
                        hold_reason: string | null;
                        /** @enum {string|null} */
                        traffic_class: "transactional" | "marketing" | null;
                        scheduled_at: string;
                        delivery_started_at: string | null;
                        route_snapshot: {
                            [key: string]: unknown;
                        } | null;
                        attempts: ({
                            provider: string;
                            instance_id: string;
                            ordinal: number;
                            status: string;
                            error: string | null;
                            diagnostics: {
                                [key: string]: unknown;
                            };
                            started_at: string;
                            finished_at: string | null;
                        } & {
                            [key: string]: unknown;
                        })[];
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_reschedule: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    scheduled_at: string;
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_source: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        source: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_cancel: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_domains: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": ({
                        id: string;
                        org_id?: string;
                        environment_id?: string;
                        created_at: string;
                        name: string;
                        status: string;
                        ownership_status: string;
                        dmarc_evidence: {
                            [key: string]: unknown;
                        };
                        readiness: {
                            environment: string;
                            blockers: string[];
                            transports: ({
                                transport_instance: string;
                                provider: string;
                                ready: boolean;
                                blockers: string[];
                                dkim_aligned: boolean | null;
                                spf_aligned: boolean | null;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                        records: {
                            [key: string]: unknown;
                        }[];
                        sending: boolean;
                        receiving: boolean;
                        enforce_tls: boolean;
                    } & {
                        [key: string]: unknown;
                    })[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_createDomain: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    region?: string;
                    sending?: boolean;
                    receiving?: boolean;
                    open_tracking?: boolean;
                    click_tracking?: boolean;
                    tracking_subdomain?: string;
                    enforce_tls?: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        name: string;
                        status: string;
                        records: {
                            [key: string]: unknown;
                        }[];
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_domain: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        org_id?: string;
                        environment_id?: string;
                        created_at: string;
                        name: string;
                        status: string;
                        ownership_status: string;
                        dmarc_evidence: {
                            [key: string]: unknown;
                        };
                        readiness: {
                            environment: string;
                            blockers: string[];
                            transports: ({
                                transport_instance: string;
                                provider: string;
                                ready: boolean;
                                blockers: string[];
                                dkim_aligned: boolean | null;
                                spf_aligned: boolean | null;
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                        records: {
                            [key: string]: unknown;
                        }[];
                        sending: boolean;
                        receiving: boolean;
                        enforce_tls: boolean;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_updateDomain: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    sending?: boolean;
                    receiving?: boolean;
                    open_tracking?: boolean;
                    click_tracking?: boolean;
                    tracking_subdomain?: string;
                    enforce_tls?: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        status: string;
                        records: {
                            [key: string]: unknown;
                        }[];
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_verify: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        status: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_suppressions: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": ({
                        email: string;
                        reason: string;
                        protected: boolean;
                        created_at: string;
                    } & {
                        [key: string]: unknown;
                    })[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_suppress: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MailController_unsuppress: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                email: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    MetricsController_metrics: {
        parameters: {
            query?: {
                from?: string;
                to?: string;
                domain_id?: string;
                tag_name?: string;
                tag_value?: string;
                workflow?: string;
                channel?: "email" | "in_app" | "sms" | "push" | "chat";
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_endpoints: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_createEndpoint: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    /** Format: uri */
                    url: string;
                    events?: string[];
                    enabled?: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_updateEndpoint: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name?: string;
                    /** Format: uri */
                    url?: string;
                    events?: string[];
                    enabled?: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_rotate: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_testEndpoint: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_deliveries: {
        parameters: {
            query?: {
                page?: number;
                limit?: number;
                endpoint_id?: string;
                status?: "pending" | "delivering" | "delivered" | "failed";
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            [key: string]: unknown;
                        }[];
                        page?: number;
                        limit?: number;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_delivery: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_replay: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_alerts: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_logs: {
        parameters: {
            query?: {
                page?: number;
                limit?: number;
                q?: string;
                status?: number;
                status_class?: number;
                method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
                from?: string;
                to?: string;
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            [key: string]: unknown;
                        }[];
                        page?: number;
                        limit?: number;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_exportLogs: {
        parameters: {
            query?: {
                page?: number;
                limit?: number;
                q?: string;
                status?: number;
                status_class?: number;
                method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";
                from?: string;
                to?: string;
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "text/csv": string;
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_log: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperationsController_engineEvent: {
        parameters: {
            query?: never;
            header: {
                "svix-id": string;
                "svix-timestamp": string;
                "svix-signature": string;
            };
            path: {
                environment: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    type: string;
                    data: {
                        [key: string]: unknown;
                    };
                } & {
                    [key: string]: unknown;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorReadinessController_list: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orgId: string;
                domainId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorReadinessController_record: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orgId: string;
                domainId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: number;
                    reason: string;
                    evidence: {
                        /** @enum {string} */
                        kind: "received_headers";
                        /** @enum {string} */
                        provenance: "operator_attested_receiver_headers";
                        transport_instance: string;
                        proof_reference: string;
                        /** Format: date-time */
                        checked_at: string;
                        header_from_domain: string;
                        dkim_domain: string;
                        dkim_pass: boolean;
                        mail_from_domain: string;
                        spf_pass: boolean;
                        dmarc_pass: boolean;
                        ses?: {
                            identity_verified: boolean;
                            mail_from_domain: string;
                            /** @enum {string} */
                            status: "PENDING" | "SUCCESS" | "FAILED" | "TEMPORARY_FAILURE";
                            /** @enum {string} */
                            behavior_on_mx_failure: "USE_DEFAULT_VALUE" | "REJECT_MESSAGE";
                            /** Format: date-time */
                            checked_at: string;
                        };
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorReadinessController_revoke: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orgId: string;
                domainId: string;
                instanceId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: number;
                    reason: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorController_routes: {
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorController_createRoute: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: uuid */
                    id?: string;
                    expected_revision: number;
                    name: string;
                    /** @enum {string} */
                    traffic_class: "transactional" | "marketing";
                    /** @enum {string} */
                    trust_tier: "customer" | "pareto";
                    critical: boolean;
                    transport_instances: string[];
                    physical_ips: string[];
                    proof_reference?: string;
                    verified: boolean;
                    reason: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorController_disableRoute: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                id: string;
                revision: number;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    reason: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorController_logout: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorController_session: {
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        user: {
                            id: string;
                            email: string;
                        } & {
                            [key: string]: unknown;
                        };
                        step_up_required: boolean;
                        verified_until: string | null;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorController_stepUp: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    code: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        verified_until: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorController_policies: {
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": ({
                        org_id?: string;
                        name: string;
                        /** @enum {string} */
                        state: "pending_review" | "approved" | "suspended";
                        revision: number;
                        daily_limit: number;
                        per_minute_limit: number;
                        complaint_threshold: number;
                        hard_bounce_rate: number;
                        hard_bounce_min: number;
                        marketing_enabled: boolean;
                        default_traffic_class: string | null;
                        trust_tier: string;
                        route_bindings: {
                            [key: string]: unknown;
                        };
                        suspension_reason: string | null;
                        reviewed_at: string | null;
                        updated_at: string;
                        usage: {
                            reserved: number;
                            sent_24h: number;
                        } & {
                            [key: string]: unknown;
                        };
                        feedback: {
                            recipients_24h: number;
                            hard_bounces: number;
                            complaints: number;
                            unknown: number;
                            latest_at: string | null;
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    })[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorController_policy: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orgId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        org_id?: string;
                        name: string;
                        /** @enum {string} */
                        state: "pending_review" | "approved" | "suspended";
                        revision: number;
                        daily_limit: number;
                        per_minute_limit: number;
                        complaint_threshold: number;
                        hard_bounce_rate: number;
                        hard_bounce_min: number;
                        marketing_enabled: boolean;
                        default_traffic_class: string | null;
                        trust_tier: string;
                        route_bindings: {
                            [key: string]: unknown;
                        };
                        suspension_reason: string | null;
                        reviewed_at: string | null;
                        updated_at: string;
                        usage: {
                            reserved: number;
                            sent_24h: number;
                        } & {
                            [key: string]: unknown;
                        };
                        feedback: {
                            recipients_24h: number;
                            hard_bounces: number;
                            complaints: number;
                            unknown: number;
                            latest_at: string | null;
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorController_update: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orgId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: number;
                    reason: string;
                    /** @enum {string} */
                    state?: "pending_review" | "approved" | "suspended";
                    daily_limit?: number;
                    per_minute_limit?: number;
                    complaint_threshold?: number;
                    hard_bounce_rate?: number;
                    hard_bounce_min?: number;
                    marketing_enabled?: boolean;
                    /** @enum {string|null} */
                    default_traffic_class?: "transactional" | "marketing" | null;
                    /** @enum {string} */
                    trust_tier?: "customer" | "pareto";
                    route_bindings?: {
                        transactional?: {
                            /** Format: uuid */
                            id: string;
                            revision: number;
                        };
                        marketing?: {
                            /** Format: uuid */
                            id: string;
                            revision: number;
                        };
                        critical?: {
                            /** Format: uuid */
                            id: string;
                            revision: number;
                        };
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        org_id?: string;
                        name: string;
                        /** @enum {string} */
                        state: "pending_review" | "approved" | "suspended";
                        revision: number;
                        daily_limit: number;
                        per_minute_limit: number;
                        complaint_threshold: number;
                        hard_bounce_rate: number;
                        hard_bounce_min: number;
                        marketing_enabled: boolean;
                        default_traffic_class: string | null;
                        trust_tier: string;
                        route_bindings: {
                            [key: string]: unknown;
                        };
                        suspension_reason: string | null;
                        reviewed_at: string | null;
                        updated_at: string;
                        usage: {
                            reserved: number;
                            sent_24h: number;
                        } & {
                            [key: string]: unknown;
                        };
                        feedback: {
                            recipients_24h: number;
                            hard_bounces: number;
                            complaints: number;
                            unknown: number;
                            latest_at: string | null;
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorController_audit: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orgId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    }[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorController_restore: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orgId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    /** Format: email */
                    email: string;
                    reason: string;
                    expected_revision: number;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    OperatorController_credential: {
        parameters: {
            query?: never;
            header?: never;
            path: {
                orgId: string;
                keyId: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    expected_revision: number;
                    reason: string;
                    /** @enum {string|null} */
                    traffic_class: "transactional" | "marketing" | null;
                    critical_sending: boolean;
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        org_id?: string;
                        name: string;
                        /** @enum {string} */
                        state: "pending_review" | "approved" | "suspended";
                        revision: number;
                        daily_limit: number;
                        per_minute_limit: number;
                        complaint_threshold: number;
                        hard_bounce_rate: number;
                        hard_bounce_min: number;
                        marketing_enabled: boolean;
                        default_traffic_class: string | null;
                        trust_tier: string;
                        route_bindings: {
                            [key: string]: unknown;
                        };
                        suspension_reason: string | null;
                        reviewed_at: string | null;
                        updated_at: string;
                        usage: {
                            reserved: number;
                            sent_24h: number;
                        } & {
                            [key: string]: unknown;
                        };
                        feedback: {
                            recipients_24h: number;
                            hard_bounces: number;
                            complaints: number;
                            unknown: number;
                            latest_at: string | null;
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    PublicationController_diff: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        diff_token: string;
                        workflows: {
                            [key: string]: unknown;
                        }[];
                        automations: {
                            [key: string]: unknown;
                        }[];
                        layouts: {
                            [key: string]: unknown;
                        }[];
                        translations: {
                            [key: string]: unknown;
                        }[];
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    PublicationController_create: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    workflows?: string[];
                    automations?: string[];
                    layouts?: string[];
                    translations?: string[];
                    diff_token?: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        /** @enum {string} */
                        status: "pending" | "failed" | "completed" | "superseded";
                        error?: string | null;
                        items?: ({
                            id: string;
                            kind: string;
                            identifier: string;
                            status: string;
                            attempts: number;
                            error: string | null;
                        } & {
                            [key: string]: unknown;
                        })[];
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    PublicationController_list: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": ({
                        id: string;
                        /** @enum {string} */
                        status: "pending" | "failed" | "completed" | "superseded";
                        error?: string | null;
                        items?: ({
                            id: string;
                            kind: string;
                            identifier: string;
                            status: string;
                            attempts: number;
                            error: string | null;
                        } & {
                            [key: string]: unknown;
                        })[];
                    } & {
                        [key: string]: unknown;
                    })[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    PublicationController_detail: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        /** @enum {string} */
                        status: "pending" | "failed" | "completed" | "superseded";
                        error?: string | null;
                        items?: ({
                            id: string;
                            kind: string;
                            identifier: string;
                            status: string;
                            attempts: number;
                            error: string | null;
                        } & {
                            [key: string]: unknown;
                        })[];
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    PublicationController_retry: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        status: string;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_list: {
        parameters: {
            query?: {
                page?: number;
                limit?: number;
                q?: string;
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: ({
                            id: string;
                            org_id?: string;
                            environment_id?: string;
                            created_at: string;
                            identifier: string;
                            definition: {
                                [key: string]: unknown;
                            };
                            source_definition: {
                                [key: string]: unknown;
                            };
                            revision: number;
                            content_dependencies: {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        })[];
                        page?: number;
                        limit?: number;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_create: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    workflowId: string;
                    name: string;
                    description?: string;
                    tags?: string[];
                    /** @enum {string} */
                    severity?: "high" | "medium" | "low" | "none";
                    active?: boolean;
                    critical?: boolean;
                    payloadSchema?: {
                        [key: string]: unknown;
                    };
                    defaults?: {
                        in_app?: boolean;
                        email?: boolean;
                        sms?: boolean;
                        push?: boolean;
                        chat?: boolean;
                    };
                    preferences?: {
                        in_app?: boolean;
                        email?: boolean;
                        sms?: boolean;
                        push?: boolean;
                        chat?: boolean;
                    };
                    steps: {
                        stepId: string;
                        name: string;
                        /** @enum {string} */
                        type: "in_app" | "email" | "sms" | "push" | "chat" | "delay" | "digest" | "throttle" | "http_request";
                        controlValues?: {
                            [key: string]: unknown;
                        };
                    }[];
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        org_id?: string;
                        environment_id?: string;
                        created_at: string;
                        identifier: string;
                        definition: {
                            [key: string]: unknown;
                        };
                        source_definition: {
                            [key: string]: unknown;
                        };
                        revision: number;
                        content_dependencies: {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_get: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        org_id?: string;
                        environment_id?: string;
                        created_at: string;
                        identifier: string;
                        definition: {
                            [key: string]: unknown;
                        };
                        source_definition: {
                            [key: string]: unknown;
                        };
                        revision: number;
                        content_dependencies: {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_update: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    workflowId: string;
                    name: string;
                    description?: string;
                    tags?: string[];
                    /** @enum {string} */
                    severity?: "high" | "medium" | "low" | "none";
                    active?: boolean;
                    critical?: boolean;
                    payloadSchema?: {
                        [key: string]: unknown;
                    };
                    defaults?: {
                        in_app?: boolean;
                        email?: boolean;
                        sms?: boolean;
                        push?: boolean;
                        chat?: boolean;
                    };
                    preferences?: {
                        in_app?: boolean;
                        email?: boolean;
                        sms?: boolean;
                        push?: boolean;
                        chat?: boolean;
                    };
                    steps: {
                        stepId: string;
                        name: string;
                        /** @enum {string} */
                        type: "in_app" | "email" | "sms" | "push" | "chat" | "delay" | "digest" | "throttle" | "http_request";
                        controlValues?: {
                            [key: string]: unknown;
                        };
                    }[];
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        org_id?: string;
                        environment_id?: string;
                        created_at: string;
                        identifier: string;
                        definition: {
                            [key: string]: unknown;
                        };
                        source_definition: {
                            [key: string]: unknown;
                        };
                        revision: number;
                        content_dependencies: {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_remove: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_trigger: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
                /** @description 24-hour validated-request deduplication. Reusing a key with different content returns 409. */
                "Idempotency-Key"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    to?: (string | {
                        subscriberId: string;
                        firstName?: string;
                        lastName?: string;
                        /** Format: email */
                        email?: string;
                        phone?: string;
                        /** Format: uri */
                        avatar?: string;
                        locale?: string;
                        timezone?: string;
                        data?: {
                            [key: string]: unknown;
                        };
                    } | {
                        /** @enum {string} */
                        type: "Topic";
                        topicKey: string;
                    }) | (string | {
                        subscriberId: string;
                        firstName?: string;
                        lastName?: string;
                        /** Format: email */
                        email?: string;
                        phone?: string;
                        /** Format: uri */
                        avatar?: string;
                        locale?: string;
                        timezone?: string;
                        data?: {
                            [key: string]: unknown;
                        };
                    } | {
                        /** @enum {string} */
                        type: "Topic";
                        topicKey: string;
                    })[];
                    broadcast?: boolean;
                    payload?: {
                        [key: string]: unknown;
                    };
                    overrides?: {
                        [key: string]: unknown;
                    };
                    actor?: string;
                    transactionId?: string;
                    context?: {
                        [key: string]: string;
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        transactionId: string;
                        ids: string[];
                        status: string;
                        recipients: number;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_bulk: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
                /** @description 24-hour validated-request deduplication. Reusing a key with different content returns 409. */
                "Idempotency-Key"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    name: string;
                    to?: (string | {
                        subscriberId: string;
                        firstName?: string;
                        lastName?: string;
                        /** Format: email */
                        email?: string;
                        phone?: string;
                        /** Format: uri */
                        avatar?: string;
                        locale?: string;
                        timezone?: string;
                        data?: {
                            [key: string]: unknown;
                        };
                    } | {
                        /** @enum {string} */
                        type: "Topic";
                        topicKey: string;
                    }) | (string | {
                        subscriberId: string;
                        firstName?: string;
                        lastName?: string;
                        /** Format: email */
                        email?: string;
                        phone?: string;
                        /** Format: uri */
                        avatar?: string;
                        locale?: string;
                        timezone?: string;
                        data?: {
                            [key: string]: unknown;
                        };
                    } | {
                        /** @enum {string} */
                        type: "Topic";
                        topicKey: string;
                    })[];
                    broadcast?: boolean;
                    payload?: {
                        [key: string]: unknown;
                    };
                    overrides?: {
                        [key: string]: unknown;
                    };
                    actor?: string;
                    transactionId?: string;
                    context?: {
                        [key: string]: string;
                    };
                }[];
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            [key: string]: unknown;
                        }[];
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_cancel: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                transactionId: string;
            };
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_activity: {
        parameters: {
            query?: {
                page?: number;
                limit?: number;
                q?: string;
                workflow?: string;
                status?: "queued" | "dispatching" | "accepted" | "failed" | "ambiguous" | "canceled";
                transactionId?: string;
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: ({
                            id: string;
                            org_id?: string;
                            environment_id?: string;
                            created_at: string;
                            workflow_id: string;
                            transaction_id: string;
                            parent_transaction_id: string;
                            status: string;
                            attempts: number;
                            error: string | null;
                            cancellation_status: string;
                        } & {
                            [key: string]: unknown;
                        })[];
                        page?: number;
                        limit?: number;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_reconciliation: {
        parameters: {
            query: {
                before: string;
                cursor?: string;
                limit?: number;
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: {
                            id: string;
                            workflow_id: string;
                            transaction_id: string;
                            parent_transaction_id: string | null;
                            status: string;
                            attempts: number;
                            cancellation_status: string;
                            /** Format: date-time */
                            created_at: string;
                            /** Format: date-time */
                            updated_at: string;
                            /** @enum {string} */
                            queue_presence: "unknown";
                            /** @enum {boolean} */
                            replay_allowed: false;
                        }[];
                        /** Format: date-time */
                        before: string;
                        next_cursor: string | null;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_inspection: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        workflow_id: string;
                        transaction_id: string;
                        parent_transaction_id: string | null;
                        status: string;
                        attempts: number;
                        cancellation_status: string;
                        /** Format: date-time */
                        created_at: string;
                        /** Format: date-time */
                        updated_at: string;
                        /** @enum {string} */
                        queue_presence: "unknown";
                        /** @enum {boolean} */
                        replay_allowed: false;
                        engine_observation: {
                            /** @enum {string} */
                            status: "available" | "unavailable" | "not_found" | "not_requested";
                            /** Format: date-time */
                            checked_at: string | null;
                            partial: boolean;
                            notifications: {
                                id: string;
                                /** @enum {string} */
                                status: "pending" | "running" | "completed" | "failed" | "canceled" | "unknown";
                                /** Format: date-time */
                                created_at: string | null;
                                /** Format: date-time */
                                updated_at: string | null;
                                jobs: {
                                    id: string | null;
                                    type: string;
                                    /** @enum {string} */
                                    status: "pending" | "queued" | "running" | "completed" | "failed" | "delayed" | "canceled" | "merged" | "skipped" | "unknown";
                                    /** Format: date-time */
                                    created_at: string | null;
                                    /** Format: date-time */
                                    updated_at: string | null;
                                }[];
                            }[];
                        };
                        cancellation: {
                            eligible: boolean;
                            transaction_id: string;
                            /** @enum {string} */
                            scope: "trigger";
                            /** @enum {string} */
                            reason: "queued" | "pending_action" | "local_state" | "unknown" | "no_pending_action";
                        };
                        observation_age_ms: number | null;
                        partial: boolean;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_activityDetail: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        id: string;
                        org_id?: string;
                        environment_id?: string;
                        created_at: string;
                        workflow_id: string;
                        transaction_id: string;
                        parent_transaction_id: string;
                        status: string;
                        attempts: number;
                        error: string | null;
                        cancellation_status: string;
                        updated_at: string;
                        payload: {
                            [key: string]: unknown;
                        };
                        engine: unknown;
                        engine_observation: {
                            /** @enum {string} */
                            status: "available" | "unavailable" | "not_found" | "not_requested";
                            /** Format: date-time */
                            checked_at: string | null;
                            partial: boolean;
                            notifications: ({
                                id: string;
                                /** @enum {string} */
                                status: "pending" | "running" | "completed" | "failed" | "canceled" | "unknown";
                                /** Format: date-time */
                                created_at: string | null;
                                /** Format: date-time */
                                updated_at: string | null;
                                jobs: ({
                                    id: string | null;
                                    type: string;
                                    /** @enum {string} */
                                    status: "pending" | "queued" | "running" | "completed" | "failed" | "delayed" | "canceled" | "merged" | "skipped" | "unknown";
                                    /** Format: date-time */
                                    created_at: string | null;
                                    /** Format: date-time */
                                    updated_at: string | null;
                                } & {
                                    [key: string]: unknown;
                                })[];
                            } & {
                                [key: string]: unknown;
                            })[];
                        } & {
                            [key: string]: unknown;
                        };
                        cancellation: {
                            eligible: boolean;
                            transaction_id: string;
                            /** @enum {string} */
                            scope: "trigger";
                            /** @enum {string} */
                            reason: "queued" | "pending_action" | "local_state" | "unknown" | "no_pending_action";
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_subscribers: {
        parameters: {
            query?: {
                page?: number;
                limit?: number;
                q?: string;
            };
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        data: ({
                            id: string;
                            org_id?: string;
                            environment_id?: string;
                            created_at: string;
                            subscriber_id: string;
                            profile: {
                                [key: string]: unknown;
                            };
                            preferences: {
                                [key: string]: unknown;
                            };
                        } & {
                            [key: string]: unknown;
                        })[];
                        page?: number;
                        limit?: number;
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_subscriber: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    subscriberId: string;
                    firstName?: string;
                    lastName?: string;
                    /** Format: email */
                    email?: string;
                    phone?: string;
                    /** Format: uri */
                    avatar?: string;
                    locale?: string;
                    timezone?: string;
                    data?: {
                        [key: string]: unknown;
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_getSubscriber: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_preferences: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_setPreferences: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                id: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    workflowId?: string;
                    channels: {
                        in_app?: boolean;
                        email?: boolean;
                        sms?: boolean;
                        push?: boolean;
                        chat?: boolean;
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_inbox: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
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
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        subscriberId: string;
                        subscriberHash: string;
                        applicationIdentifier: string | null;
                        backendUrl: string;
                        socketUrl: string;
                        socketOptions?: {
                            /** @enum {string} */
                            socketType: "self-hosted";
                            transports: "websocket"[];
                            auth: {
                                /** Format: uuid */
                                flareSessionId: string;
                            } & {
                                [key: string]: unknown;
                            };
                            reconnectionAttempts: number;
                            reconnectionDelayMax: number;
                            timeout: number;
                        } & {
                            [key: string]: unknown;
                        };
                    } & {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_topics: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": ({
                        id: string;
                        org_id?: string;
                        environment_id?: string;
                        created_at: string;
                        key: string;
                        name: string;
                    } & {
                        [key: string]: unknown;
                    })[];
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_topic: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    key: string;
                    name: string;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_subscribe: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    subscribers: string[];
                    context?: {
                        [key: string]: string;
                    };
                    condition?: unknown;
                };
            };
        };
        responses: {
            /** @description Success */
            201: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
    WorkflowController_unsubscribe: {
        parameters: {
            query?: never;
            header?: {
                /** @description Required for user sessions. API keys are bound to one environment; supplying this header verifies that selection. */
                "x-environment-id"?: string;
                /** @description Required for user sessions; optional tenant assertion for API keys. */
                "x-org-id"?: string;
            };
            path: {
                key: string;
            };
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": {
                    subscribers: string[];
                    context?: {
                        [key: string]: string;
                    };
                };
            };
        };
        responses: {
            /** @description Success */
            200: {
                headers: {
                    "x-request-id"?: string;
                    "RateLimit-Limit"?: number;
                    "RateLimit-Remaining"?: number;
                    /** @description Seconds until bucket refills */
                    "RateLimit-Reset"?: number;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: unknown;
                    };
                };
            };
            /** @description Request failed */
            400: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            401: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            403: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            404: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            409: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            413: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            422: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Rate limited */
            429: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Request failed */
            502: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
            /** @description Dependency unavailable */
            503: {
                headers: {
                    "Retry-After"?: string;
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Error"];
                };
            };
        };
    };
}
