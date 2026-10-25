/**
 * Country lookup for the WorldMap archetype.
 * Rows are "id|ALPHA3|Official-ish name|alias,alias". `id` is the ISO 3166-1 numeric code used by
 * world-atlas (or the atlas name for the three features without a code).
 * Any of alpha-3, the table name, an alias or the atlas's own name resolves (case/punctuation-insensitive).
 */
const ROWS = `
004|AFG|Afghanistan
008|ALB|Albania
012|DZA|Algeria
016|ASM|American Samoa
020|AND|Andorra
024|AGO|Angola
660|AIA|Anguilla
010|ATA|Antarctica
028|ATG|Antigua and Barbuda
032|ARG|Argentina
051|ARM|Armenia
533|ABW|Aruba
036|AUS|Australia
040|AUT|Austria
031|AZE|Azerbaijan
044|BHS|Bahamas|The Bahamas
048|BHR|Bahrain
050|BGD|Bangladesh
052|BRB|Barbados
112|BLR|Belarus
056|BEL|Belgium
084|BLZ|Belize
204|BEN|Benin
060|BMU|Bermuda
064|BTN|Bhutan
068|BOL|Bolivia
070|BIH|Bosnia and Herzegovina|Bosnia
072|BWA|Botswana
076|BRA|Brazil
086|IOT|British Indian Ocean Territory
092|VGB|British Virgin Islands
096|BRN|Brunei
100|BGR|Bulgaria
854|BFA|Burkina Faso
108|BDI|Burundi
132|CPV|Cabo Verde|Cape Verde
116|KHM|Cambodia
120|CMR|Cameroon
124|CAN|Canada
136|CYM|Cayman Islands
140|CAF|Central African Republic
148|TCD|Chad
152|CHL|Chile
156|CHN|China|PRC
170|COL|Colombia
174|COM|Comoros
178|COG|Republic of the Congo|Congo-Brazzaville
180|COD|Democratic Republic of the Congo|DR Congo,DRC,Congo-Kinshasa
184|COK|Cook Islands
188|CRI|Costa Rica
384|CIV|Cote d'Ivoire|Ivory Coast
191|HRV|Croatia
192|CUB|Cuba
531|CUW|Curacao
196|CYP|Cyprus
203|CZE|Czechia|Czech Republic
208|DNK|Denmark
262|DJI|Djibouti
212|DMA|Dominica
214|DOM|Dominican Republic
218|ECU|Ecuador
818|EGY|Egypt
222|SLV|El Salvador
226|GNQ|Equatorial Guinea
232|ERI|Eritrea
233|EST|Estonia
748|SWZ|Eswatini|Swaziland
231|ETH|Ethiopia
238|FLK|Falkland Islands
234|FRO|Faroe Islands
242|FJI|Fiji
246|FIN|Finland
250|FRA|France
258|PYF|French Polynesia
260|ATF|French Southern Territories
266|GAB|Gabon
270|GMB|Gambia|The Gambia
268|GEO|Georgia
276|DEU|Germany
288|GHA|Ghana
300|GRC|Greece
304|GRL|Greenland
308|GRD|Grenada
316|GUM|Guam
320|GTM|Guatemala
831|GGY|Guernsey
324|GIN|Guinea
624|GNB|Guinea-Bissau
328|GUY|Guyana
332|HTI|Haiti
334|HMD|Heard Island and McDonald Islands
336|VAT|Vatican|Vatican City,Holy See
340|HND|Honduras
344|HKG|Hong Kong
348|HUN|Hungary
352|ISL|Iceland
356|IND|India
360|IDN|Indonesia
364|IRN|Iran
368|IRQ|Iraq
372|IRL|Ireland
833|IMN|Isle of Man
376|ISR|Israel
380|ITA|Italy
388|JAM|Jamaica
392|JPN|Japan
832|JEY|Jersey
400|JOR|Jordan
398|KAZ|Kazakhstan
404|KEN|Kenya
296|KIR|Kiribati
Kosovo|XKX|Kosovo
414|KWT|Kuwait
417|KGZ|Kyrgyzstan
418|LAO|Laos
428|LVA|Latvia
422|LBN|Lebanon
426|LSO|Lesotho
430|LBR|Liberia
434|LBY|Libya
438|LIE|Liechtenstein
440|LTU|Lithuania
442|LUX|Luxembourg
446|MAC|Macao|Macau
450|MDG|Madagascar
454|MWI|Malawi
458|MYS|Malaysia
462|MDV|Maldives
466|MLI|Mali
470|MLT|Malta
584|MHL|Marshall Islands
478|MRT|Mauritania
480|MUS|Mauritius
484|MEX|Mexico
583|FSM|Micronesia
498|MDA|Moldova
492|MCO|Monaco
496|MNG|Mongolia
499|MNE|Montenegro
500|MSR|Montserrat
504|MAR|Morocco
508|MOZ|Mozambique
104|MMR|Myanmar|Burma
516|NAM|Namibia
520|NRU|Nauru
524|NPL|Nepal
528|NLD|Netherlands|Holland
540|NCL|New Caledonia
554|NZL|New Zealand
558|NIC|Nicaragua
562|NER|Niger
566|NGA|Nigeria
570|NIU|Niue
574|NFK|Norfolk Island
408|PRK|North Korea|DPRK
807|MKD|North Macedonia|Macedonia
N. Cyprus|CYN|Northern Cyprus
580|MNP|Northern Mariana Islands
578|NOR|Norway
512|OMN|Oman
586|PAK|Pakistan
585|PLW|Palau
275|PSE|Palestine|West Bank,Gaza
591|PAN|Panama
598|PNG|Papua New Guinea
600|PRY|Paraguay
604|PER|Peru
608|PHL|Philippines
612|PCN|Pitcairn Islands
616|POL|Poland
620|PRT|Portugal
630|PRI|Puerto Rico
634|QAT|Qatar
642|ROU|Romania
643|RUS|Russia|Russian Federation
646|RWA|Rwanda
654|SHN|Saint Helena
659|KNA|Saint Kitts and Nevis
662|LCA|Saint Lucia
670|VCT|Saint Vincent and the Grenadines
882|WSM|Samoa
674|SMR|San Marino
678|STP|Sao Tome and Principe
682|SAU|Saudi Arabia
686|SEN|Senegal
688|SRB|Serbia
690|SYC|Seychelles
694|SLE|Sierra Leone
702|SGP|Singapore
534|SXM|Sint Maarten
703|SVK|Slovakia
705|SVN|Slovenia
090|SLB|Solomon Islands
706|SOM|Somalia
Somaliland|SOL|Somaliland
710|ZAF|South Africa
239|SGS|South Georgia and the South Sandwich Islands
410|KOR|South Korea|Korea,Republic of Korea
728|SSD|South Sudan
724|ESP|Spain
144|LKA|Sri Lanka
666|SPM|Saint Pierre and Miquelon
729|SDN|Sudan
740|SUR|Suriname
752|SWE|Sweden
756|CHE|Switzerland
760|SYR|Syria
158|TWN|Taiwan
762|TJK|Tajikistan
834|TZA|Tanzania
764|THA|Thailand
626|TLS|Timor-Leste|East Timor
768|TGO|Togo
776|TON|Tonga
780|TTO|Trinidad and Tobago
788|TUN|Tunisia
792|TUR|Turkey|Turkiye
795|TKM|Turkmenistan
796|TCA|Turks and Caicos Islands
800|UGA|Uganda
804|UKR|Ukraine
784|ARE|United Arab Emirates|UAE
826|GBR|United Kingdom|UK,Britain,Great Britain
840|USA|United States|United States of America,US,U.S.,America
858|URY|Uruguay
850|VIR|U.S. Virgin Islands
860|UZB|Uzbekistan
548|VUT|Vanuatu
862|VEN|Venezuela
704|VNM|Vietnam|Viet Nam
876|WLF|Wallis and Futuna
732|ESH|Western Sahara
887|YEM|Yemen
894|ZMB|Zambia
716|ZWE|Zimbabwe
248|ALA|Aland
652|BLM|Saint Barthelemy
663|MAF|Saint Martin
`;

export interface CountryRow {
  id: string;
  alpha3: string;
  name: string;
}

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\bis\.?(?=\s|$)/g, "islands")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const BY_KEY = new Map<string, string>();
const ROW_BY_ID = new Map<string, CountryRow>();
for (const line of ROWS.trim().split("\n")) {
  const [id, alpha3, name, aliases] = line.split("|");
  ROW_BY_ID.set(id, { id, alpha3, name });
  BY_KEY.set(norm(alpha3), id);
  BY_KEY.set(norm(name), id);
  for (const a of (aliases ?? "").split(",").filter(Boolean)) BY_KEY.set(norm(a), id);
}

/** Resolve an ISO alpha-3 code or a country name to the atlas feature id, or null. */
export function resolveCountryId(input: string, atlasNames?: Map<string, string>): string | null {
  const k = norm(input);
  return BY_KEY.get(k) ?? atlasNames?.get(k) ?? null;
}

export function countryRow(id: string): CountryRow | undefined {
  return ROW_BY_ID.get(id);
}

/** Names accepted without needing the atlas (used by schema validation). */
export function isKnownCountry(input: string): boolean {
  return BY_KEY.has(norm(input));
}
export { norm as normalizeCountryKey };
