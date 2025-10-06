--
-- PostgreSQL database dump
--

\restrict qZaKQ3KZUT1fdOMDidG5qqjWVODsEFPT4o4VItcyCndW5QGSmzn8ptg4JXVNYyn

-- Dumped from database version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.10 (Ubuntu 16.10-0ubuntu0.24.04.1)

-- Started on 2025-09-18 10:40:47 CEST

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 229 (class 1259 OID 24691)
-- Name: ai_outputs_log; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.ai_outputs_log (
    id integer NOT NULL,
    user_id integer,
    output_type character varying(100) NOT NULL,
    prompt text NOT NULL,
    response text NOT NULL,
    model_version character varying(50) DEFAULT 'gpt-4o'::character varying,
    processing_time_ms integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    system_id integer,
    is_current boolean DEFAULT true
);


ALTER TABLE public.ai_outputs_log OWNER TO majestic;

--
-- TOC entry 228 (class 1259 OID 24690)
-- Name: ai_outputs_log_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.ai_outputs_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.ai_outputs_log_id_seq OWNER TO majestic;

--
-- TOC entry 3630 (class 0 OID 0)
-- Dependencies: 228
-- Name: ai_outputs_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.ai_outputs_log_id_seq OWNED BY public.ai_outputs_log.id;


--
-- TOC entry 237 (class 1259 OID 24783)
-- Name: custom_reference_ranges; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.custom_reference_ranges (
    id integer NOT NULL,
    user_id integer,
    metric_name character varying(255) NOT NULL,
    min_value numeric NOT NULL,
    max_value numeric NOT NULL,
    units character varying(50) NOT NULL,
    medical_condition character varying(100) NOT NULL,
    condition_details text,
    notes text,
    valid_from date,
    valid_until date,
    is_active boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.custom_reference_ranges OWNER TO majestic;

--
-- TOC entry 236 (class 1259 OID 24782)
-- Name: custom_reference_ranges_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.custom_reference_ranges_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.custom_reference_ranges_id_seq OWNER TO majestic;

--
-- TOC entry 3631 (class 0 OID 0)
-- Dependencies: 236
-- Name: custom_reference_ranges_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.custom_reference_ranges_id_seq OWNED BY public.custom_reference_ranges.id;


--
-- TOC entry 217 (class 1259 OID 24594)
-- Name: health_systems; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.health_systems (
    id integer NOT NULL,
    name character varying(100) NOT NULL,
    description text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.health_systems OWNER TO majestic;

--
-- TOC entry 233 (class 1259 OID 24737)
-- Name: imaging_studies; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.imaging_studies (
    id integer NOT NULL,
    user_id integer,
    linked_system_id integer,
    study_type character varying(100),
    file_url text,
    thumbnail_url text,
    test_date date,
    ai_summary text,
    metrics_json jsonb,
    comparison_summary text,
    metric_changes_json jsonb,
    status character varying(50) DEFAULT 'pendingProcessing'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.imaging_studies OWNER TO majestic;

--
-- TOC entry 232 (class 1259 OID 24736)
-- Name: imaging_studies_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.imaging_studies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.imaging_studies_id_seq OWNER TO majestic;

--
-- TOC entry 3632 (class 0 OID 0)
-- Dependencies: 232
-- Name: imaging_studies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.imaging_studies_id_seq OWNED BY public.imaging_studies.id;


--
-- TOC entry 241 (class 1259 OID 24831)
-- Name: master_conversion_groups; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.master_conversion_groups (
    conversion_group_id character varying(100) NOT NULL,
    canonical_unit character varying(50),
    alt_unit character varying(50),
    to_canonical_formula character varying(255),
    from_canonical_formula character varying(255),
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.master_conversion_groups OWNER TO majestic;

--
-- TOC entry 240 (class 1259 OID 24817)
-- Name: master_metric_synonyms; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.master_metric_synonyms (
    id integer NOT NULL,
    synonym_id character varying(100),
    metric_id character varying(100),
    synonym_name character varying(255) NOT NULL,
    notes text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.master_metric_synonyms OWNER TO majestic;

--
-- TOC entry 239 (class 1259 OID 24816)
-- Name: master_metric_synonyms_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.master_metric_synonyms_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.master_metric_synonyms_id_seq OWNER TO majestic;

--
-- TOC entry 3633 (class 0 OID 0)
-- Dependencies: 239
-- Name: master_metric_synonyms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.master_metric_synonyms_id_seq OWNED BY public.master_metric_synonyms.id;


--
-- TOC entry 238 (class 1259 OID 24801)
-- Name: master_metrics; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.master_metrics (
    metric_id character varying(100) NOT NULL,
    metric_name character varying(255) NOT NULL,
    system_id integer,
    canonical_unit character varying(50),
    conversion_group_id character varying(100),
    normal_min numeric(10,3),
    normal_max numeric(10,3),
    is_key_metric boolean DEFAULT false,
    source character varying(100),
    explanation text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.master_metrics OWNER TO majestic;

--
-- TOC entry 244 (class 1259 OID 24853)
-- Name: master_snapshots; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.master_snapshots (
    version_id integer NOT NULL,
    metrics_json jsonb,
    synonyms_json jsonb,
    conversion_groups_json jsonb
);


ALTER TABLE public.master_snapshots OWNER TO majestic;

--
-- TOC entry 243 (class 1259 OID 24841)
-- Name: master_versions; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.master_versions (
    version_id integer NOT NULL,
    change_summary text NOT NULL,
    created_by character varying(255),
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    xlsx_path text,
    data_hash character varying(128),
    added_count integer DEFAULT 0,
    changed_count integer DEFAULT 0,
    removed_count integer DEFAULT 0
);


ALTER TABLE public.master_versions OWNER TO majestic;

--
-- TOC entry 242 (class 1259 OID 24840)
-- Name: master_versions_version_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.master_versions_version_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.master_versions_version_id_seq OWNER TO majestic;

--
-- TOC entry 3634 (class 0 OID 0)
-- Dependencies: 242
-- Name: master_versions_version_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.master_versions_version_id_seq OWNED BY public.master_versions.version_id;


--
-- TOC entry 221 (class 1259 OID 24620)
-- Name: metrics; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.metrics (
    id integer NOT NULL,
    user_id integer,
    upload_id integer,
    system_id integer,
    metric_name character varying(255) NOT NULL,
    metric_value numeric,
    metric_unit character varying(50),
    reference_range text,
    is_key_metric boolean DEFAULT false,
    is_outlier boolean DEFAULT false,
    test_date date,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.metrics OWNER TO majestic;

--
-- TOC entry 220 (class 1259 OID 24619)
-- Name: metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.metrics_id_seq OWNER TO majestic;

--
-- TOC entry 3635 (class 0 OID 0)
-- Dependencies: 220
-- Name: metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.metrics_id_seq OWNED BY public.metrics.id;


--
-- TOC entry 235 (class 1259 OID 24759)
-- Name: pending_metric_suggestions; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.pending_metric_suggestions (
    id integer NOT NULL,
    user_id integer,
    upload_id integer,
    unmatched_metrics jsonb NOT NULL,
    ai_suggestions jsonb,
    test_date date,
    status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.pending_metric_suggestions OWNER TO majestic;

--
-- TOC entry 234 (class 1259 OID 24758)
-- Name: pending_metric_suggestions_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.pending_metric_suggestions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.pending_metric_suggestions_id_seq OWNER TO majestic;

--
-- TOC entry 3636 (class 0 OID 0)
-- Dependencies: 234
-- Name: pending_metric_suggestions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.pending_metric_suggestions_id_seq OWNED BY public.pending_metric_suggestions.id;


--
-- TOC entry 223 (class 1259 OID 24649)
-- Name: questionnaire_responses; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.questionnaire_responses (
    id integer NOT NULL,
    user_id integer,
    question_type character varying(255) NOT NULL,
    question text NOT NULL,
    response text NOT NULL,
    response_date date DEFAULT CURRENT_DATE,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.questionnaire_responses OWNER TO majestic;

--
-- TOC entry 222 (class 1259 OID 24648)
-- Name: questionnaire_responses_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.questionnaire_responses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.questionnaire_responses_id_seq OWNER TO majestic;

--
-- TOC entry 3637 (class 0 OID 0)
-- Dependencies: 222
-- Name: questionnaire_responses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.questionnaire_responses_id_seq OWNED BY public.questionnaire_responses.id;


--
-- TOC entry 219 (class 1259 OID 24603)
-- Name: uploads; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.uploads (
    id integer NOT NULL,
    user_id integer,
    filename character varying(255) NOT NULL,
    file_type character varying(50),
    file_size integer,
    upload_type character varying(50) DEFAULT 'manual'::character varying,
    storage_path text,
    processing_status character varying(50) DEFAULT 'pending'::character varying,
    processing_error text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    processed_at timestamp without time zone
);


ALTER TABLE public.uploads OWNER TO majestic;

--
-- TOC entry 218 (class 1259 OID 24602)
-- Name: uploads_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.uploads_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.uploads_id_seq OWNER TO majestic;

--
-- TOC entry 3638 (class 0 OID 0)
-- Dependencies: 218
-- Name: uploads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.uploads_id_seq OWNED BY public.uploads.id;


--
-- TOC entry 227 (class 1259 OID 24678)
-- Name: user_allergies; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.user_allergies (
    id integer NOT NULL,
    user_id integer NOT NULL,
    allergy_type character varying(40) NOT NULL,
    allergen_name character varying(200) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_allergies OWNER TO majestic;

--
-- TOC entry 226 (class 1259 OID 24677)
-- Name: user_allergies_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.user_allergies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_allergies_id_seq OWNER TO majestic;

--
-- TOC entry 3639 (class 0 OID 0)
-- Dependencies: 226
-- Name: user_allergies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.user_allergies_id_seq OWNED BY public.user_allergies.id;


--
-- TOC entry 225 (class 1259 OID 24665)
-- Name: user_chronic_conditions; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.user_chronic_conditions (
    id integer NOT NULL,
    user_id integer NOT NULL,
    condition_name character varying(200) NOT NULL,
    status character varying(20) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_chronic_conditions OWNER TO majestic;

--
-- TOC entry 224 (class 1259 OID 24664)
-- Name: user_chronic_conditions_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.user_chronic_conditions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_chronic_conditions_id_seq OWNER TO majestic;

--
-- TOC entry 3640 (class 0 OID 0)
-- Dependencies: 224
-- Name: user_chronic_conditions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.user_chronic_conditions_id_seq OWNED BY public.user_chronic_conditions.id;


--
-- TOC entry 231 (class 1259 OID 24714)
-- Name: user_custom_metrics; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.user_custom_metrics (
    id integer NOT NULL,
    system_id integer,
    user_id integer,
    metric_name character varying(255) NOT NULL,
    value character varying(100) NOT NULL,
    units character varying(50),
    normal_range_min numeric(10,3),
    normal_range_max numeric(10,3),
    range_applicable_to character varying(100) DEFAULT 'General'::character varying,
    source_type character varying(50) DEFAULT 'user'::character varying,
    review_status character varying(50) DEFAULT 'pending'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.user_custom_metrics OWNER TO majestic;

--
-- TOC entry 230 (class 1259 OID 24713)
-- Name: user_custom_metrics_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.user_custom_metrics_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.user_custom_metrics_id_seq OWNER TO majestic;

--
-- TOC entry 3641 (class 0 OID 0)
-- Dependencies: 230
-- Name: user_custom_metrics_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.user_custom_metrics_id_seq OWNED BY public.user_custom_metrics.id;


--
-- TOC entry 216 (class 1259 OID 24579)
-- Name: users; Type: TABLE; Schema: public; Owner: majestic
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying(255) NOT NULL,
    google_id character varying(255),
    name character varying(255),
    avatar_url text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    preferred_unit_system character varying(10),
    sex character varying(50),
    date_of_birth date,
    height_in integer,
    weight_lb numeric(5,2),
    ethnicity character varying(100),
    country_of_residence character varying(3),
    smoker boolean,
    packs_per_week numeric(3,1),
    alcohol_drinks_per_week integer,
    pregnant boolean,
    pregnancy_start_date date,
    cycle_phase character varying(50),
    profile_completed boolean DEFAULT false,
    profile_updated_at timestamp without time zone
);


ALTER TABLE public.users OWNER TO majestic;

--
-- TOC entry 215 (class 1259 OID 24578)
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: majestic
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO majestic;

--
-- TOC entry 3642 (class 0 OID 0)
-- Dependencies: 215
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: majestic
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- TOC entry 3343 (class 2604 OID 24694)
-- Name: ai_outputs_log id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.ai_outputs_log ALTER COLUMN id SET DEFAULT nextval('public.ai_outputs_log_id_seq'::regclass);


--
-- TOC entry 3361 (class 2604 OID 24786)
-- Name: custom_reference_ranges id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.custom_reference_ranges ALTER COLUMN id SET DEFAULT nextval('public.custom_reference_ranges_id_seq'::regclass);


--
-- TOC entry 3353 (class 2604 OID 24740)
-- Name: imaging_studies id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.imaging_studies ALTER COLUMN id SET DEFAULT nextval('public.imaging_studies_id_seq'::regclass);


--
-- TOC entry 3368 (class 2604 OID 24820)
-- Name: master_metric_synonyms id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.master_metric_synonyms ALTER COLUMN id SET DEFAULT nextval('public.master_metric_synonyms_id_seq'::regclass);


--
-- TOC entry 3372 (class 2604 OID 24844)
-- Name: master_versions version_id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.master_versions ALTER COLUMN version_id SET DEFAULT nextval('public.master_versions_version_id_seq'::regclass);


--
-- TOC entry 3332 (class 2604 OID 24623)
-- Name: metrics id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.metrics ALTER COLUMN id SET DEFAULT nextval('public.metrics_id_seq'::regclass);


--
-- TOC entry 3357 (class 2604 OID 24762)
-- Name: pending_metric_suggestions id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.pending_metric_suggestions ALTER COLUMN id SET DEFAULT nextval('public.pending_metric_suggestions_id_seq'::regclass);


--
-- TOC entry 3336 (class 2604 OID 24652)
-- Name: questionnaire_responses id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.questionnaire_responses ALTER COLUMN id SET DEFAULT nextval('public.questionnaire_responses_id_seq'::regclass);


--
-- TOC entry 3328 (class 2604 OID 24606)
-- Name: uploads id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.uploads ALTER COLUMN id SET DEFAULT nextval('public.uploads_id_seq'::regclass);


--
-- TOC entry 3341 (class 2604 OID 24681)
-- Name: user_allergies id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.user_allergies ALTER COLUMN id SET DEFAULT nextval('public.user_allergies_id_seq'::regclass);


--
-- TOC entry 3339 (class 2604 OID 24668)
-- Name: user_chronic_conditions id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.user_chronic_conditions ALTER COLUMN id SET DEFAULT nextval('public.user_chronic_conditions_id_seq'::regclass);


--
-- TOC entry 3348 (class 2604 OID 24717)
-- Name: user_custom_metrics id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.user_custom_metrics ALTER COLUMN id SET DEFAULT nextval('public.user_custom_metrics_id_seq'::regclass);


--
-- TOC entry 3323 (class 2604 OID 24582)
-- Name: users id; Type: DEFAULT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- TOC entry 3608 (class 0 OID 24691)
-- Dependencies: 229
-- Data for Name: ai_outputs_log; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.ai_outputs_log (id, user_id, output_type, prompt, response, model_version, processing_time_ms, created_at, updated_at, system_id, is_current) FROM stdin;
1	2	system_insights	system_id:1	{"system_status":"Mild Concern","summary_insight":"The cardiovascular system shows a mild concern with the current lab data. Specifically, HDL cholesterol levels are within the normal range, suggesting healthy levels for protective lipoproteins. However, the triglycerides are slightly above the desired maximum of 100 mg/dL, which could suggest a risk for cardiovascular conditions if unaddressed. No visual study data is available to further assess for other cardiovascular issues or to corroborate lab findings.","out_of_range_metrics":[{"metric_name":"Triglycerides","value_and_range":"109 mg/dL vs. 0–100 mg/dL","definition":"Triglycerides are a type of fat found in your blood, used by your body for energy.","implication":"Elevated triglyceride levels can lead to an increased risk of cardiovascular disease, pancreatitis, and potentially other metabolic conditions.","recommendations":"Increase physical activity, reduce intake of sugars and refined carbohydrates, and consider consulting a healthcare provider for potential medication if lifestyle changes are insufficient."}],"recommendations":["Consider lifestyle modifications, such as increasing physical activity or changing diet, to lower triglyceride levels.","Regular follow-ups with a healthcare provider to monitor triglyceride levels and general cardiovascular health.","No current imaging data available; consider obtaining visual studies such as an echocardiogram or stress test for comprehensive assessment."]}	gpt-4o	0	2025-09-13 18:46:05.167886	2025-09-13 18:46:05.167886	1	t
2	2	system_insights	system_id:8	{"system_status":"Optimal","summary_insight":"The current evaluation of the urinary system based on available laboratory data indicates an optimal status. Lipoprotein (a) levels are well within the normal range, suggesting no indication of concern related to this particular biomarker within the urinary system. Unfortunately, no visual study data has been provided to further corroborate or assess structural or functional aspects, which would provide a more comprehensive overview.","out_of_range_metrics":[],"recommendations":["Maintain routine check-ups to track any future changes in urinary lab metrics.","Ensure a balanced diet and adequate hydration, which supports optimal kidney function.","Consider annual or bi-annual ultrasound imaging of the urinary system to detect early structural changes, ensuring comprehensive monitoring when such data becomes available."]}	gpt-4o	0	2025-09-13 18:46:09.354894	2025-09-13 18:46:09.354894	8	t
3	2	system_insights	system_id:1	{"system_status":"Mild Concern","summary_insight":"The cardiovascular system evaluation shows HDL Cholesterol levels within acceptable limits, yet higher triglyceride levels than the normal range in multiple tests, which may suggest an increased risk for cardiovascular diseases. Absence of visual imaging constrains understanding any physical or structural issues. Given the recurring pattern of elevated triglycerides, addressing lifestyle factors is advisable.","out_of_range_metrics":[{"metric_name":"Triglycerides","value_and_range":"109 mg/dL vs. 0–100 mg/dL","definition":"Triglycerides are a type of fat (lipid) found in your blood. High levels can increase the risk of heart disease.","implication":"Slightly elevated triglyceride levels can suggest lifestyle factors or metabolic disorders, potentially increasing cardiovascular risk.","recommendations":"Consider lifestyle modifications including dietary changes, increased physical activity, and monitoring weight to reduce triglyceride levels."}],"recommendations":["Focus on a heart-healthy diet, decreasing intake of saturated fats and sugars to lower triglyceride levels.","Engage in regular physical activity, aiming for at least 150 minutes of moderate exercise weekly to improve cardiovascular health.","Reassess cardiovascular risk with repeat testing and consider potential medications if lifestyle changes do not reduce triglyceride levels.","Consult a healthcare provider to discuss potential benefits of omega-3 fatty acids or other triglyceride-lowering supplements."]}	gpt-4o	0	2025-09-13 21:09:27.568483	2025-09-13 21:09:27.568483	1	t
4	2	system_insights	system_id:8	{"system_status":"Optimal","summary_insight":"The analysis of the provided data for the urinary system indicates that lipoprotein(a) levels are within the normal range. Lipoprotein(a) is primarily assessed in cardiovascular contexts, not directly linked to urinary function. No visual studies are available to integrate at this time, so the assessment relies solely on the lab data showing stable, normal values.","out_of_range_metrics":[],"recommendations":["Continue regular monitoring of urinary and cardiovascular indicators as per standard health guidelines.","Maintain a balanced diet and active lifestyle to support overall health, which indirectly supports urinary and cardiovascular systems.","Ensure routine check-ups that may include both lab tests and imaging when clinically indicated to capture comprehensive data, including renal function assessments if there are specific concerns."]}	gpt-4o	0	2025-09-13 21:09:30.637858	2025-09-13 21:09:30.637858	8	t
\.


--
-- TOC entry 3616 (class 0 OID 24783)
-- Dependencies: 237
-- Data for Name: custom_reference_ranges; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.custom_reference_ranges (id, user_id, metric_name, min_value, max_value, units, medical_condition, condition_details, notes, valid_from, valid_until, is_active, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 3596 (class 0 OID 24594)
-- Dependencies: 217
-- Data for Name: health_systems; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.health_systems (id, name, description, created_at) FROM stdin;
1	Cardiovascular	Heart and blood vessel health	2025-09-13 17:54:13.018187
2	Nervous/Brain	Cognitive and neurological function	2025-09-13 17:54:13.034617
3	Respiratory	Lung and breathing function	2025-09-13 17:54:13.041208
4	Muscular	Muscle mass and strength	2025-09-13 17:54:13.046552
5	Skeletal	Bone health and density	2025-09-13 17:54:13.051878
6	Digestive	Gut health and liver function	2025-09-13 17:54:13.057129
7	Endocrine	Hormone regulation and metabolism	2025-09-13 17:54:13.063526
8	Urinary	Kidney and urinary function	2025-09-13 17:54:13.069152
9	Reproductive	Reproductive hormone health	2025-09-13 17:54:13.074528
10	Integumentary	Skin, hair, and nail health	2025-09-13 17:54:13.079988
11	Immune/Inflammation	Immune system and inflammation markers	2025-09-13 17:54:13.085027
12	Sensory	Vision, hearing, and sensory function	2025-09-13 17:54:13.090199
13	Genetics & Biological Age	Cellular aging and longevity markers	2025-09-13 17:54:13.095015
\.


--
-- TOC entry 3612 (class 0 OID 24737)
-- Dependencies: 233
-- Data for Name: imaging_studies; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.imaging_studies (id, user_id, linked_system_id, study_type, file_url, thumbnail_url, test_date, ai_summary, metrics_json, comparison_summary, metric_changes_json, status, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 3620 (class 0 OID 24831)
-- Dependencies: 241
-- Data for Name: master_conversion_groups; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.master_conversion_groups (conversion_group_id, canonical_unit, alt_unit, to_canonical_formula, from_canonical_formula, notes, created_at, updated_at) FROM stdin;
cholesterol_like	mg/dL	mmol/L	x * 38.67	x / 38.67	TC, LDL, HDL	2025-09-13 21:52:51.850769	2025-09-13 21:52:51.850769
glucose_like	mg/dL	mmol/L	x * 18.0	x / 18.0	Glucose fasting	2025-09-13 21:52:51.850769	2025-09-13 21:52:51.850769
\.


--
-- TOC entry 3619 (class 0 OID 24817)
-- Dependencies: 240
-- Data for Name: master_metric_synonyms; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.master_metric_synonyms (id, synonym_id, metric_id, synonym_name, notes, created_at) FROM stdin;
13	syn1	cholesterol_total	TC	Total Cholesterol	2025-09-13 21:52:51.850769
14	syn2	hdl	HDL-C	HDL Cholesterol	2025-09-13 21:52:51.850769
15	syn3	ldl	LDL-C	LDL Cholesterol	2025-09-13 21:52:51.850769
16	syn4	glucose_fasting	FBG	Fasting Blood Glucose	2025-09-13 21:52:51.850769
\.


--
-- TOC entry 3617 (class 0 OID 24801)
-- Dependencies: 238
-- Data for Name: master_metrics; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.master_metrics (metric_id, metric_name, system_id, canonical_unit, conversion_group_id, normal_min, normal_max, is_key_metric, source, explanation, created_at, updated_at) FROM stdin;
cholesterol_total	Total Cholesterol	1	mg/dL	cholesterol_like	125.000	200.000	t	CDC	Total cholesterol level	2025-09-13 21:52:51.850769	2025-09-13 21:52:51.850769
hdl	HDL Cholesterol	1	mg/dL	cholesterol_like	40.000	90.000	t	CDC	High-density lipoprotein (good cholesterol)	2025-09-13 21:52:51.850769	2025-09-13 21:52:51.850769
ldl	LDL Cholesterol	1	mg/dL	cholesterol_like	70.000	130.000	t	CDC	Low-density lipoprotein (bad cholesterol)	2025-09-13 21:52:51.850769	2025-09-13 21:52:51.850769
glucose_fasting	Fasting Glucose	6	mg/dL	glucose_like	70.000	99.000	t	ADA	Fasting blood glucose	2025-09-13 21:52:51.850769	2025-09-13 21:52:51.850769
\.


--
-- TOC entry 3623 (class 0 OID 24853)
-- Dependencies: 244
-- Data for Name: master_snapshots; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.master_snapshots (version_id, metrics_json, synonyms_json, conversion_groups_json) FROM stdin;
1	[{"source": "CDC", "metric_id": "cholesterol_total", "system_id": 1, "normal_max": 200, "normal_min": 125, "explanation": "Total cholesterol level", "metric_name": "Total Cholesterol", "is_key_metric": "Y", "canonical_unit": "mg/dL", "conversion_group_id": "cholesterol_like"}, {"source": "CDC", "metric_id": "hdl", "system_id": 1, "normal_max": 90, "normal_min": 40, "explanation": "High-density lipoprotein (good cholesterol)", "metric_name": "HDL Cholesterol", "is_key_metric": "Y", "canonical_unit": "mg/dL", "conversion_group_id": "cholesterol_like"}, {"source": "CDC", "metric_id": "ldl", "system_id": 1, "normal_max": 130, "normal_min": 70, "explanation": "Low-density lipoprotein (bad cholesterol)", "metric_name": "LDL Cholesterol", "is_key_metric": "Y", "canonical_unit": "mg/dL", "conversion_group_id": "cholesterol_like"}, {"source": "ADA", "metric_id": "glucose_fasting", "system_id": 6, "normal_max": 99, "normal_min": 70, "explanation": "Fasting blood glucose", "metric_name": "Fasting Glucose", "is_key_metric": "Y", "canonical_unit": "mg/dL", "conversion_group_id": "glucose_like"}]	[{"notes": "Total Cholesterol", "metric_id": "cholesterol_total", "synonym_id": "syn1", "synonym_name": "TC"}, {"notes": "HDL Cholesterol", "metric_id": "hdl", "synonym_id": "syn2", "synonym_name": "HDL-C"}, {"notes": "LDL Cholesterol", "metric_id": "ldl", "synonym_id": "syn3", "synonym_name": "LDL-C"}, {"notes": "Fasting Blood Glucose", "metric_id": "glucose_fasting", "synonym_id": "syn4", "synonym_name": "FBG"}]	[{"notes": "TC, LDL, HDL", "alt_unit": "mmol/L", "canonical_unit": "mg/dL", "conversion_group_id": "cholesterol_like", "to_canonical_formula": "x * 38.67", "from_canonical_formula": "x / 38.67"}, {"notes": "Glucose fasting", "alt_unit": "mmol/L", "canonical_unit": "mg/dL", "conversion_group_id": "glucose_like", "to_canonical_formula": "x * 18.0", "from_canonical_formula": "x / 18.0"}]
2	[{"source": "CDC", "metric_id": "cholesterol_total", "system_id": 1, "normal_max": 200, "normal_min": 136, "explanation": "Total cholesterol level", "metric_name": "Total Cholesterol", "is_key_metric": "Y", "canonical_unit": "mg/dL", "conversion_group_id": "cholesterol_like"}, {"source": "CDC", "metric_id": "hdl", "system_id": 1, "normal_max": 90, "normal_min": 40, "explanation": "High-density lipoprotein (good cholesterol)", "metric_name": "HDL Cholesterol", "is_key_metric": "Y", "canonical_unit": "mg/dL", "conversion_group_id": "cholesterol_like"}, {"source": "CDC", "metric_id": "ldl", "system_id": 1, "normal_max": 130, "normal_min": 70, "explanation": "Low-density lipoprotein (bad cholesterol)", "metric_name": "LDL Cholesterol", "is_key_metric": "Y", "canonical_unit": "mg/dL", "conversion_group_id": "cholesterol_like"}, {"source": "ADA", "metric_id": "glucose_fasting", "system_id": 6, "normal_max": 99, "normal_min": 70, "explanation": "Fasting blood glucose", "metric_name": "Fasting Glucose", "is_key_metric": "Y", "canonical_unit": "mg/dL", "conversion_group_id": "glucose_like"}]	[{"notes": "Total Cholesterol", "metric_id": "cholesterol_total", "synonym_id": "syn1", "synonym_name": "TC"}, {"notes": "HDL Cholesterol", "metric_id": "hdl", "synonym_id": "syn2", "synonym_name": "HDL-C"}, {"notes": "LDL Cholesterol", "metric_id": "ldl", "synonym_id": "syn3", "synonym_name": "LDL-C"}, {"notes": "Fasting Blood Glucose", "metric_id": "glucose_fasting", "synonym_id": "syn4", "synonym_name": "FBG"}]	[{"notes": "TC, LDL, HDL", "alt_unit": "mmol/L", "canonical_unit": "mg/dL", "conversion_group_id": "cholesterol_like", "to_canonical_formula": "x * 38.67", "from_canonical_formula": "x / 38.67"}, {"notes": "Glucose fasting", "alt_unit": "mmol/L", "canonical_unit": "mg/dL", "conversion_group_id": "glucose_like", "to_canonical_formula": "x * 18.0", "from_canonical_formula": "x / 18.0"}]
\.


--
-- TOC entry 3622 (class 0 OID 24841)
-- Dependencies: 243
-- Data for Name: master_versions; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.master_versions (version_id, change_summary, created_by, created_at, xlsx_path, data_hash, added_count, changed_count, removed_count) FROM stdin;
1	update	jmzv13@gmail.com	2025-09-13 21:45:18.645479	\N	328d7ee8bc735028c0ea4c238bb55be040a1ee6eae367bb207d7db8b4caa4759	4	0	0
2	update	jmzv13@gmail.com	2025-09-13 21:51:13.944478	\N	a7c850e33b6dffa8e77b89d892146f7c10fe35a2aba2b673f5f56a0745f63c82	0	4	0
\.


--
-- TOC entry 3600 (class 0 OID 24620)
-- Dependencies: 221
-- Data for Name: metrics; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.metrics (id, user_id, upload_id, system_id, metric_name, metric_value, metric_unit, reference_range, is_key_metric, is_outlier, test_date, created_at) FROM stdin;
1	2	1	1	HDL Cholesterol	48	mg/dL	>39 mg/dL	t	f	2025-09-13	2025-09-13 18:44:56.853157
2	2	1	1	Triglycerides	109	mg/dL	0-150	t	f	2025-09-13	2025-09-13 18:44:57.146673
3	2	1	8	Lipoprotein (a)	19	nmol/L	0-30	f	f	2025-09-13	2025-09-13 18:44:57.158019
4	2	2	1	HDL Cholesterol	48	mg/dL	>39 mg/dL	t	f	2025-09-25	2025-09-13 21:08:21.06886
5	2	2	1	Triglycerides	109	mg/dL	0-150	t	f	2025-09-25	2025-09-13 21:08:21.080685
6	2	2	8	Lipoprotein (a)	19	nmol/L	0-30	f	f	2025-09-25	2025-09-13 21:08:21.086094
\.


--
-- TOC entry 3614 (class 0 OID 24759)
-- Dependencies: 235
-- Data for Name: pending_metric_suggestions; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.pending_metric_suggestions (id, user_id, upload_id, unmatched_metrics, ai_suggestions, test_date, status, created_at, updated_at) FROM stdin;
1	2	1	[{"name": "Cholesterol", "unit": "mg/dL", "value": 222, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<200 mg/dL"}, {"name": "LDL Calculated", "unit": "mg/dL", "value": 151, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<100 mg/dL"}, {"name": "Chol/HDL Ratio", "unit": "calc", "value": 4.6, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<5.0 calc"}, {"name": "NON-HDL CHOLESTEROL", "unit": "mg/dL", "value": 174, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<130 mg/dL"}, {"name": "LDL PARTICLES, TOTAL", "unit": "nmol/L", "value": 2144, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<1,138 nmol/L"}, {"name": "LDL, SMALL", "unit": "nmol/L", "value": 333, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<142 nmol/L"}, {"name": "LDL, MEDIUM", "unit": "nmol/L", "value": 419, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<215 nmol/L"}, {"name": "HDL, LARGE", "unit": "nmol/L", "value": 4764, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": ">6,729 nmol/L"}, {"name": "LDL PARTICLE SIZE", "unit": "Angstrom", "value": 224.2, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": ">222.9 Angstrom"}, {"name": "Apolipoprotein B", "unit": "mg/dL", "value": 130, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<90 mg/dL"}, {"name": "CARDIO CRP(R)", "unit": "mg/L", "value": 0.8, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<1.0 mg/L"}, {"name": "LA PLA2 ACTIVITY", "unit": "nmol/min/mL", "value": 93, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<124 nmol/min/mL"}]	{"suggestions": [{"original_name": "Cholesterol", "suggested_matches": [{"reason": "The term 'Cholesterol' typically refers to Total Cholesterol in a cardiovascular context.", "confidence": 0.98, "standard_name": "Total Cholesterol"}], "clarification_note": "", "needs_clarification": false}, {"original_name": "LDL Calculated", "suggested_matches": [{"reason": "LDL Calculated is a common method for determining LDL Cholesterol levels.", "confidence": 0.95, "standard_name": "LDL"}], "clarification_note": "", "needs_clarification": false}, {"original_name": "Chol/HDL Ratio", "suggested_matches": [], "clarification_note": "No direct standard metric match; Chol/HDL Ratio is a calculated value often used in cardiovascular risk assessment.", "needs_clarification": true}, {"original_name": "NON-HDL CHOLESTEROL", "suggested_matches": [], "clarification_note": "Non-HDL Cholesterol is not directly listed but is a recognized cardiovascular risk marker.", "needs_clarification": true}, {"original_name": "LDL PARTICLES, TOTAL", "suggested_matches": [], "clarification_note": "LDL Particle Number is not directly listed but is a specialized lipid measurement.", "needs_clarification": true}, {"original_name": "LDL, SMALL", "suggested_matches": [], "clarification_note": "Small LDL particles are a specific subclass of LDL not directly listed.", "needs_clarification": true}, {"original_name": "LDL, MEDIUM", "suggested_matches": [], "clarification_note": "Medium LDL particles are a specific subclass of LDL not directly listed.", "needs_clarification": true}, {"original_name": "HDL, LARGE", "suggested_matches": [], "clarification_note": "Large HDL particles are a specific subclass of HDL not directly listed.", "needs_clarification": true}, {"original_name": "LDL PARTICLE SIZE", "suggested_matches": [], "clarification_note": "LDL Particle Size is a specialized measurement not directly listed.", "needs_clarification": true}, {"original_name": "Apolipoprotein B", "suggested_matches": [{"reason": "Apolipoprotein B is commonly abbreviated as ApoB in standard metrics.", "confidence": 0.99, "standard_name": "Apolipoprotein B (ApoB)"}], "clarification_note": "", "needs_clarification": false}, {"original_name": "CARDIO CRP(R)", "suggested_matches": [{"reason": "Cardio CRP likely refers to high-sensitivity CRP, used in cardiovascular risk assessment.", "confidence": 0.97, "standard_name": "High-sensitivity CRP (hs-CRP)"}], "clarification_note": "", "needs_clarification": false}, {"original_name": "LA PLA2 ACTIVITY", "suggested_matches": [], "clarification_note": "Lipoprotein-associated phospholipase A2 (Lp-PLA2) activity is a specialized cardiovascular marker not directly listed.", "needs_clarification": true}]}	2025-09-13	pending	2025-09-13 18:44:57.174211	2025-09-13 18:44:57.174211
2	2	2	[{"name": "Cholesterol", "unit": "mg/dL", "value": 222, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<200 mg/dL"}, {"name": "LDL Calculated", "unit": "mg/dL", "value": 151, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<100 mg/dL"}, {"name": "Chol/HDL Ratio", "unit": "calc", "value": 4.6, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<5.0 calc"}, {"name": "NON-HDL CHOLESTEROL", "unit": "mg/dL", "value": 174, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<130 mg/dL"}, {"name": "LDL PARTICLES, TOTAL", "unit": "nmol/L", "value": 2144, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<1138 nmol/L"}, {"name": "LDL, SMALL", "unit": "nmol/L", "value": 333, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<142 nmol/L"}, {"name": "LDL, MEDIUM", "unit": "nmol/L", "value": 419, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<215 nmol/L"}, {"name": "HDL, LARGE", "unit": "nmol/L", "value": 4764, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": ">6729 nmol/L"}, {"name": "LDL PARTICLE SIZE", "unit": "Angstrom", "value": 224.2, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": ">222.9 Angstrom"}, {"name": "Apolipoprotein B", "unit": "mg/dL", "value": 130, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<90 mg/dL"}, {"name": "CARDIO CRP(R)", "unit": "mg/L", "value": 0.8, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<1.0 mg/L"}, {"name": "LA PLA2 ACTIVITY", "unit": "nmol/min/mL", "value": 93, "category": "cardiovascular", "test_date": "2025-02-04", "reference_range": "<124 nmol/min/mL"}]	{"suggestions": [{"original_name": "Cholesterol", "suggested_matches": [{"reason": "The term 'Cholesterol' typically refers to Total Cholesterol in a cardiovascular context.", "confidence": 0.98, "standard_name": "Total Cholesterol"}], "clarification_note": "", "needs_clarification": false}, {"original_name": "LDL Calculated", "suggested_matches": [{"reason": "LDL Calculated is commonly referred to as LDL Cholesterol, which is a standard metric.", "confidence": 0.95, "standard_name": "LDL"}], "clarification_note": "", "needs_clarification": false}, {"original_name": "Chol/HDL Ratio", "suggested_matches": [], "clarification_note": "No direct standard metric match; Chol/HDL Ratio is a derived metric.", "needs_clarification": true}, {"original_name": "NON-HDL CHOLESTEROL", "suggested_matches": [], "clarification_note": "Non-HDL Cholesterol is not directly listed but is a recognized cardiovascular risk metric.", "needs_clarification": true}, {"original_name": "LDL PARTICLES, TOTAL", "suggested_matches": [], "clarification_note": "LDL Particle Count is not directly listed; requires manual review.", "needs_clarification": true}, {"original_name": "LDL, SMALL", "suggested_matches": [], "clarification_note": "Specific LDL particle sizes are not standard metrics; requires manual review.", "needs_clarification": true}, {"original_name": "LDL, MEDIUM", "suggested_matches": [], "clarification_note": "Specific LDL particle sizes are not standard metrics; requires manual review.", "needs_clarification": true}, {"original_name": "HDL, LARGE", "suggested_matches": [], "clarification_note": "Specific HDL particle sizes are not standard metrics; requires manual review.", "needs_clarification": true}, {"original_name": "LDL PARTICLE SIZE", "suggested_matches": [], "clarification_note": "LDL Particle Size is not directly listed; requires manual review.", "needs_clarification": true}, {"original_name": "Apolipoprotein B", "suggested_matches": [{"reason": "Apolipoprotein B is commonly abbreviated as ApoB, which is a standard metric.", "confidence": 0.99, "standard_name": "Apolipoprotein B (ApoB)"}], "clarification_note": "", "needs_clarification": false}, {"original_name": "CARDIO CRP(R)", "suggested_matches": [{"reason": "Cardio CRP likely refers to high-sensitivity CRP, used for cardiovascular risk assessment.", "confidence": 0.95, "standard_name": "High-sensitivity CRP (hs-CRP)"}], "clarification_note": "", "needs_clarification": false}, {"original_name": "LA PLA2 ACTIVITY", "suggested_matches": [], "clarification_note": "Lipoprotein-associated phospholipase A2 (Lp-PLA2) activity is not directly listed; requires manual review.", "needs_clarification": true}]}	2025-09-25	pending	2025-09-13 21:08:21.093211	2025-09-13 21:08:21.093211
\.


--
-- TOC entry 3602 (class 0 OID 24649)
-- Dependencies: 223
-- Data for Name: questionnaire_responses; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.questionnaire_responses (id, user_id, question_type, question, response, response_date, created_at) FROM stdin;
\.


--
-- TOC entry 3598 (class 0 OID 24603)
-- Dependencies: 219
-- Data for Name: uploads; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.uploads (id, user_id, filename, file_type, file_size, upload_type, storage_path, processing_status, processing_error, created_at, processed_at) FROM stdin;
1	2	lipid panel feb 2025.pdf	application/pdf	55224	manual	\N	completed	\N	2025-09-13 18:44:47.671242	\N
2	2	lipid panel feb 2025.pdf	application/pdf	55224	manual	\N	completed	\N	2025-09-13 21:08:10.000201	\N
\.


--
-- TOC entry 3606 (class 0 OID 24678)
-- Dependencies: 227
-- Data for Name: user_allergies; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.user_allergies (id, user_id, allergy_type, allergen_name, created_at) FROM stdin;
\.


--
-- TOC entry 3604 (class 0 OID 24665)
-- Dependencies: 225
-- Data for Name: user_chronic_conditions; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.user_chronic_conditions (id, user_id, condition_name, status, created_at) FROM stdin;
\.


--
-- TOC entry 3610 (class 0 OID 24714)
-- Dependencies: 231
-- Data for Name: user_custom_metrics; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.user_custom_metrics (id, system_id, user_id, metric_name, value, units, normal_range_min, normal_range_max, range_applicable_to, source_type, review_status, created_at) FROM stdin;
\.


--
-- TOC entry 3595 (class 0 OID 24579)
-- Dependencies: 216
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: majestic
--

COPY public.users (id, email, google_id, name, avatar_url, created_at, updated_at, preferred_unit_system, sex, date_of_birth, height_in, weight_lb, ethnicity, country_of_residence, smoker, packs_per_week, alcohol_drinks_per_week, pregnant, pregnancy_start_date, cycle_phase, profile_completed, profile_updated_at) FROM stdin;
2	demo@example.com	DEMO	Demo User	https://i.pravatar.cc/150?u=demo@example.com	2025-09-13 18:42:58.706102	2025-09-13 19:43:13.965	US	\N	\N	\N	\N	\N	AX	\N	0.0	0	\N	\N	\N	t	2025-09-13 19:43:13.965
1	jmzv13@gmail.com	108994142027233031930	J. Mehdi Zapata	https://lh3.googleusercontent.com/a/ACg8ocLXjw6dlRqq5tzsd2o3y_l0ML7Pmb3akmxbJWQ_Rz-Wt6H-8A=s96-c	2025-09-13 17:54:51.974787	2025-09-13 21:51:53.96968	US	\N	\N	\N	\N	\N	ES	\N	0.0	0	\N	\N	\N	t	2025-09-13 22:13:23.942
\.


--
-- TOC entry 3643 (class 0 OID 0)
-- Dependencies: 228
-- Name: ai_outputs_log_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.ai_outputs_log_id_seq', 4, true);


--
-- TOC entry 3644 (class 0 OID 0)
-- Dependencies: 236
-- Name: custom_reference_ranges_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.custom_reference_ranges_id_seq', 1, false);


--
-- TOC entry 3645 (class 0 OID 0)
-- Dependencies: 232
-- Name: imaging_studies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.imaging_studies_id_seq', 1, false);


--
-- TOC entry 3646 (class 0 OID 0)
-- Dependencies: 239
-- Name: master_metric_synonyms_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.master_metric_synonyms_id_seq', 16, true);


--
-- TOC entry 3647 (class 0 OID 0)
-- Dependencies: 242
-- Name: master_versions_version_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.master_versions_version_id_seq', 2, true);


--
-- TOC entry 3648 (class 0 OID 0)
-- Dependencies: 220
-- Name: metrics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.metrics_id_seq', 6, true);


--
-- TOC entry 3649 (class 0 OID 0)
-- Dependencies: 234
-- Name: pending_metric_suggestions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.pending_metric_suggestions_id_seq', 2, true);


--
-- TOC entry 3650 (class 0 OID 0)
-- Dependencies: 222
-- Name: questionnaire_responses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.questionnaire_responses_id_seq', 1, false);


--
-- TOC entry 3651 (class 0 OID 0)
-- Dependencies: 218
-- Name: uploads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.uploads_id_seq', 2, true);


--
-- TOC entry 3652 (class 0 OID 0)
-- Dependencies: 226
-- Name: user_allergies_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.user_allergies_id_seq', 1, false);


--
-- TOC entry 3653 (class 0 OID 0)
-- Dependencies: 224
-- Name: user_chronic_conditions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.user_chronic_conditions_id_seq', 1, false);


--
-- TOC entry 3654 (class 0 OID 0)
-- Dependencies: 230
-- Name: user_custom_metrics_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.user_custom_metrics_id_seq', 1, false);


--
-- TOC entry 3655 (class 0 OID 0)
-- Dependencies: 215
-- Name: users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: majestic
--

SELECT pg_catalog.setval('public.users_id_seq', 2, true);


--
-- TOC entry 3401 (class 2606 OID 24700)
-- Name: ai_outputs_log ai_outputs_log_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.ai_outputs_log
    ADD CONSTRAINT ai_outputs_log_pkey PRIMARY KEY (id);


--
-- TOC entry 3417 (class 2606 OID 24793)
-- Name: custom_reference_ranges custom_reference_ranges_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.custom_reference_ranges
    ADD CONSTRAINT custom_reference_ranges_pkey PRIMARY KEY (id);


--
-- TOC entry 3419 (class 2606 OID 24795)
-- Name: custom_reference_ranges custom_reference_ranges_user_id_metric_name_medical_conditi_key; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.custom_reference_ranges
    ADD CONSTRAINT custom_reference_ranges_user_id_metric_name_medical_conditi_key UNIQUE (user_id, metric_name, medical_condition, valid_from);


--
-- TOC entry 3384 (class 2606 OID 24601)
-- Name: health_systems health_systems_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.health_systems
    ADD CONSTRAINT health_systems_pkey PRIMARY KEY (id);


--
-- TOC entry 3410 (class 2606 OID 24747)
-- Name: imaging_studies imaging_studies_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.imaging_studies
    ADD CONSTRAINT imaging_studies_pkey PRIMARY KEY (id);


--
-- TOC entry 3427 (class 2606 OID 24839)
-- Name: master_conversion_groups master_conversion_groups_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.master_conversion_groups
    ADD CONSTRAINT master_conversion_groups_pkey PRIMARY KEY (conversion_group_id);


--
-- TOC entry 3425 (class 2606 OID 24825)
-- Name: master_metric_synonyms master_metric_synonyms_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.master_metric_synonyms
    ADD CONSTRAINT master_metric_synonyms_pkey PRIMARY KEY (id);


--
-- TOC entry 3423 (class 2606 OID 24810)
-- Name: master_metrics master_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.master_metrics
    ADD CONSTRAINT master_metrics_pkey PRIMARY KEY (metric_id);


--
-- TOC entry 3431 (class 2606 OID 24859)
-- Name: master_snapshots master_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.master_snapshots
    ADD CONSTRAINT master_snapshots_pkey PRIMARY KEY (version_id);


--
-- TOC entry 3429 (class 2606 OID 24852)
-- Name: master_versions master_versions_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.master_versions
    ADD CONSTRAINT master_versions_pkey PRIMARY KEY (version_id);


--
-- TOC entry 3391 (class 2606 OID 24630)
-- Name: metrics metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.metrics
    ADD CONSTRAINT metrics_pkey PRIMARY KEY (id);


--
-- TOC entry 3393 (class 2606 OID 24632)
-- Name: metrics metrics_user_id_metric_name_test_date_upload_id_key; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.metrics
    ADD CONSTRAINT metrics_user_id_metric_name_test_date_upload_id_key UNIQUE (user_id, metric_name, test_date, upload_id);


--
-- TOC entry 3413 (class 2606 OID 24769)
-- Name: pending_metric_suggestions pending_metric_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.pending_metric_suggestions
    ADD CONSTRAINT pending_metric_suggestions_pkey PRIMARY KEY (id);


--
-- TOC entry 3415 (class 2606 OID 24771)
-- Name: pending_metric_suggestions pending_metric_suggestions_user_id_upload_id_key; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.pending_metric_suggestions
    ADD CONSTRAINT pending_metric_suggestions_user_id_upload_id_key UNIQUE (user_id, upload_id);


--
-- TOC entry 3395 (class 2606 OID 24658)
-- Name: questionnaire_responses questionnaire_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.questionnaire_responses
    ADD CONSTRAINT questionnaire_responses_pkey PRIMARY KEY (id);


--
-- TOC entry 3387 (class 2606 OID 24613)
-- Name: uploads uploads_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_pkey PRIMARY KEY (id);


--
-- TOC entry 3399 (class 2606 OID 24684)
-- Name: user_allergies user_allergies_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.user_allergies
    ADD CONSTRAINT user_allergies_pkey PRIMARY KEY (id);


--
-- TOC entry 3397 (class 2606 OID 24671)
-- Name: user_chronic_conditions user_chronic_conditions_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.user_chronic_conditions
    ADD CONSTRAINT user_chronic_conditions_pkey PRIMARY KEY (id);


--
-- TOC entry 3406 (class 2606 OID 24725)
-- Name: user_custom_metrics user_custom_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.user_custom_metrics
    ADD CONSTRAINT user_custom_metrics_pkey PRIMARY KEY (id);


--
-- TOC entry 3378 (class 2606 OID 24590)
-- Name: users users_email_key; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_email_key UNIQUE (email);


--
-- TOC entry 3380 (class 2606 OID 24592)
-- Name: users users_google_id_key; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_google_id_key UNIQUE (google_id);


--
-- TOC entry 3382 (class 2606 OID 24588)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- TOC entry 3402 (class 1259 OID 24868)
-- Name: idx_ai_outputs_user_type; Type: INDEX; Schema: public; Owner: majestic
--

CREATE INDEX idx_ai_outputs_user_type ON public.ai_outputs_log USING btree (user_id, output_type);


--
-- TOC entry 3420 (class 1259 OID 24874)
-- Name: idx_custom_ranges_user_metric; Type: INDEX; Schema: public; Owner: majestic
--

CREATE INDEX idx_custom_ranges_user_metric ON public.custom_reference_ranges USING btree (user_id, metric_name);


--
-- TOC entry 3421 (class 1259 OID 24875)
-- Name: idx_custom_ranges_validity; Type: INDEX; Schema: public; Owner: majestic
--

CREATE INDEX idx_custom_ranges_validity ON public.custom_reference_ranges USING btree (valid_from, valid_until, is_active);


--
-- TOC entry 3407 (class 1259 OID 24870)
-- Name: idx_imaging_studies_type_date; Type: INDEX; Schema: public; Owner: majestic
--

CREATE INDEX idx_imaging_studies_type_date ON public.imaging_studies USING btree (study_type, test_date);


--
-- TOC entry 3408 (class 1259 OID 24869)
-- Name: idx_imaging_studies_user_system; Type: INDEX; Schema: public; Owner: majestic
--

CREATE INDEX idx_imaging_studies_user_system ON public.imaging_studies USING btree (user_id, linked_system_id);


--
-- TOC entry 3388 (class 1259 OID 24866)
-- Name: idx_metrics_test_date; Type: INDEX; Schema: public; Owner: majestic
--

CREATE INDEX idx_metrics_test_date ON public.metrics USING btree (test_date);


--
-- TOC entry 3389 (class 1259 OID 24865)
-- Name: idx_metrics_user_system; Type: INDEX; Schema: public; Owner: majestic
--

CREATE INDEX idx_metrics_user_system ON public.metrics USING btree (user_id, system_id);


--
-- TOC entry 3411 (class 1259 OID 24873)
-- Name: idx_pending_metrics_user_status; Type: INDEX; Schema: public; Owner: majestic
--

CREATE INDEX idx_pending_metrics_user_status ON public.pending_metric_suggestions USING btree (user_id, status);


--
-- TOC entry 3385 (class 1259 OID 24867)
-- Name: idx_uploads_user_status; Type: INDEX; Schema: public; Owner: majestic
--

CREATE INDEX idx_uploads_user_status ON public.uploads USING btree (user_id, processing_status);


--
-- TOC entry 3403 (class 1259 OID 24872)
-- Name: idx_user_custom_metrics_review; Type: INDEX; Schema: public; Owner: majestic
--

CREATE INDEX idx_user_custom_metrics_review ON public.user_custom_metrics USING btree (source_type, review_status);


--
-- TOC entry 3404 (class 1259 OID 24871)
-- Name: idx_user_custom_metrics_user_system; Type: INDEX; Schema: public; Owner: majestic
--

CREATE INDEX idx_user_custom_metrics_user_system ON public.user_custom_metrics USING btree (user_id, system_id);


--
-- TOC entry 3439 (class 2606 OID 24708)
-- Name: ai_outputs_log ai_outputs_log_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.ai_outputs_log
    ADD CONSTRAINT ai_outputs_log_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.health_systems(id);


--
-- TOC entry 3440 (class 2606 OID 24701)
-- Name: ai_outputs_log ai_outputs_log_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.ai_outputs_log
    ADD CONSTRAINT ai_outputs_log_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3447 (class 2606 OID 24796)
-- Name: custom_reference_ranges custom_reference_ranges_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.custom_reference_ranges
    ADD CONSTRAINT custom_reference_ranges_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3443 (class 2606 OID 24753)
-- Name: imaging_studies imaging_studies_linked_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.imaging_studies
    ADD CONSTRAINT imaging_studies_linked_system_id_fkey FOREIGN KEY (linked_system_id) REFERENCES public.health_systems(id);


--
-- TOC entry 3444 (class 2606 OID 24748)
-- Name: imaging_studies imaging_studies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.imaging_studies
    ADD CONSTRAINT imaging_studies_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3449 (class 2606 OID 24826)
-- Name: master_metric_synonyms master_metric_synonyms_metric_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.master_metric_synonyms
    ADD CONSTRAINT master_metric_synonyms_metric_id_fkey FOREIGN KEY (metric_id) REFERENCES public.master_metrics(metric_id) ON DELETE CASCADE;


--
-- TOC entry 3448 (class 2606 OID 24811)
-- Name: master_metrics master_metrics_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.master_metrics
    ADD CONSTRAINT master_metrics_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.health_systems(id);


--
-- TOC entry 3450 (class 2606 OID 24860)
-- Name: master_snapshots master_snapshots_version_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.master_snapshots
    ADD CONSTRAINT master_snapshots_version_id_fkey FOREIGN KEY (version_id) REFERENCES public.master_versions(version_id) ON DELETE CASCADE;


--
-- TOC entry 3433 (class 2606 OID 24643)
-- Name: metrics metrics_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.metrics
    ADD CONSTRAINT metrics_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.health_systems(id);


--
-- TOC entry 3434 (class 2606 OID 24638)
-- Name: metrics metrics_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.metrics
    ADD CONSTRAINT metrics_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;


--
-- TOC entry 3435 (class 2606 OID 24633)
-- Name: metrics metrics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.metrics
    ADD CONSTRAINT metrics_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3445 (class 2606 OID 24777)
-- Name: pending_metric_suggestions pending_metric_suggestions_upload_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.pending_metric_suggestions
    ADD CONSTRAINT pending_metric_suggestions_upload_id_fkey FOREIGN KEY (upload_id) REFERENCES public.uploads(id) ON DELETE CASCADE;


--
-- TOC entry 3446 (class 2606 OID 24772)
-- Name: pending_metric_suggestions pending_metric_suggestions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.pending_metric_suggestions
    ADD CONSTRAINT pending_metric_suggestions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3436 (class 2606 OID 24659)
-- Name: questionnaire_responses questionnaire_responses_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.questionnaire_responses
    ADD CONSTRAINT questionnaire_responses_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3432 (class 2606 OID 24614)
-- Name: uploads uploads_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.uploads
    ADD CONSTRAINT uploads_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3438 (class 2606 OID 24685)
-- Name: user_allergies user_allergies_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.user_allergies
    ADD CONSTRAINT user_allergies_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3437 (class 2606 OID 24672)
-- Name: user_chronic_conditions user_chronic_conditions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.user_chronic_conditions
    ADD CONSTRAINT user_chronic_conditions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3441 (class 2606 OID 24726)
-- Name: user_custom_metrics user_custom_metrics_system_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.user_custom_metrics
    ADD CONSTRAINT user_custom_metrics_system_id_fkey FOREIGN KEY (system_id) REFERENCES public.health_systems(id) ON DELETE CASCADE;


--
-- TOC entry 3442 (class 2606 OID 24731)
-- Name: user_custom_metrics user_custom_metrics_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: majestic
--

ALTER TABLE ONLY public.user_custom_metrics
    ADD CONSTRAINT user_custom_metrics_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;


--
-- TOC entry 3629 (class 0 OID 0)
-- Dependencies: 5
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO majestic;


-- Completed on 2025-09-18 10:40:48 CEST

--
-- PostgreSQL database dump complete
--

\unrestrict qZaKQ3KZUT1fdOMDidG5qqjWVODsEFPT4o4VItcyCndW5QGSmzn8ptg4JXVNYyn

