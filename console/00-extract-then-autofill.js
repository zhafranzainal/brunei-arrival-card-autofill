(async () => {

    const SETTLE_MS = 700; // pause after an element appears, before interacting
    const TIMEOUT_MS = 15000; // how long to wait for each step

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    // Poll for an element matching `predicate` inside `root`'s subtree.
    function waitFor(predicate, root = document, label = "element") {
        return new Promise((resolve, reject) => {
            const tryFind = () => {
                try {
                    return predicate(root);
                } catch {
                    return null;
                }
            };
            const existing = tryFind();
            if (existing) return resolve(existing);

            const target = root.body || root;
            const obs = new MutationObserver(() => {
                const found = tryFind();
                if (found) {
                    obs.disconnect();
                    resolve(found);
                }
            });
            obs.observe(target, { childList: true, subtree: true });

            setTimeout(() => {
                obs.disconnect();
                reject(new Error(`Timeout waiting for ${label}`));
            }, TIMEOUT_MS);
        });
    }

    function findByText(root, selector, text) {
        return [...root.querySelectorAll(selector)].find((el) =>
            el.textContent.trim().includes(text)
        );
    }

    // Same as findByText, but accepts an array of candidate texts (first match wins).
    // Useful for bilingual labels, e.g. ["Batal", "Cancel"].
    function findByTextAny(root, selector, texts) {
        for (const text of texts) {
            const el = findByText(root, selector, text);
            if (el) return el;
        }
        return undefined;
    }

    function click(el) {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }

    // waitFor + click + settle, collapsed into one call.
    async function clickWhenFound(predicate, root, label, settleMs = SETTLE_MS) {
        const el = await waitFor(predicate, root, label);
        click(el);
        await sleep(settleMs);
        return el;
    }

    function getArrivalFrame() {
        return document.querySelector('iframe[title="E-Arrival Cards"]');
    }

    // Open (or reopen) the E-Arrival Cards dialog and return its iframe.
    async function openEArrivalCardsDialog(label = "E-Arrival Cards nav card") {
        await clickWhenFound(
            (root) => findByText(root, 'a[aria-roledescription="dialog link"]', "E-Arrival Cards"),
            document,
            label
        );
        const frame = await waitFor(getArrivalFrame, document, "E-Arrival Cards iframe");
        await sleep(SETTLE_MS);
        return frame;
    }

    // Single source of truth for fields outright copied from old arrival card.
    // (Expiry date is handled separately since it would be prompted if unavailable)
    const COPYABLE_FIELDS = [

        // Personal Identity
        "P3422_FULL_NAME",
        "P3422_DOB_DAY",
        "P3422_DOB_MONTH",
        "P3422_DOB_YEAR",
        "P3422_GENDER_CODE",
        "P3422_PLACE_OF_BIRTH",
        "P3422_NATION_CODE_ICAO",
        "P3422_IDENT_DOCUMENT_NO",
        "P3422_PLACE_OF_ISSUE",
        "P3422_FOREIGN_DOCUMENT_NO",

        // General Information
        "P3422_ADDRESS_HOME",
        "P3422_OCCUPATION",
        "P3422_Q_IS_FIRST_VISIT",
        "P3422_Q_IS_BACKPACK",
        "P3422_Q_IS_DIFFERENT_PASSPORT",
        "P3422_Q_HAS_PROHIBITED",
        "P3422_Q_HAS_A_OR_SA",
        "P3422_MOVEMENT_REASON_CODE",
        "P3422_MOVEMENT_REASON_OTHER",
        "P3422_ACCOMODATION_CODE",
        "P3422_ADDRESS_ACCOMODATION",

        // Arrival
        "P3422_CAMPANION_COUNT_IN",
        "P3422_LAST_EMBARKATION",
        "P3422_TRANSPORT_FLIGHT_NO_IN",
        "P3422_TRANSPORT_VEHICLE_NO_IN",
        "P3422_TRANSPORT_SHIP_NAME_IN",

        // Departure
        "P3422_CAMPANION_COUNT_OUT",
        "P3422_IMMEDIATE_DESTINATION",
        "P3422_TRANSPORT_FLIGHT_NO_OUT",
        "P3422_TRANSPORT_VEHICLE_NO_OUT",
        "P3422_TRANSPORT_SHIP_NAME_OUT",
    ];

    const PASSPORT_EXPIRY_DATE_FIELD = "P3422_IDENT_EXPIRY_DATE";

    function extractFromCurrentCard() {
        const frame = getArrivalFrame();
        const doc = frame ? frame.contentDocument : document;
        if (!doc) throw new Error("Cannot access iframe document");

        const fields = [...COPYABLE_FIELDS, PASSPORT_EXPIRY_DATE_FIELD];

        const data = {};
        for (const id of fields) {
            const el =
                doc.getElementById(`${id}_HIDDENVALUE`) ||
                doc.querySelector(`[name="${id}"]`) ||
                doc.getElementById(id);
            data[id] = el?.value ?? "";
        }
        window.__arrivalCardCopy = data;
        console.table(data);
        console.log("Captured from old card view.");
        return data;
    }

    function autofillBlankCard(data) {
        // If existingValue is already valid, used without prompting
        function promptDate(label, existingValue) {

            const existing = existingValue?.trim();

            if (existing) {
                return { value: existing };
            }

            while (true) {

                const input = prompt(`${label} (DD.MM.YYYY):`);

                // User cancelled
                if (input === null) {
                    alert(`❌ ${label} is required.`);
                    continue;
                }

                const value = input.trim();

                // Strict DD.MM.YYYY format
                const formatMatch = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);

                if (!formatMatch) {
                    alert(
                        "Invalid format. Please enter the date exactly as:\n" +
                        "DD.MM.YYYY\n" +
                        "e.g. 31.12.2040"
                    );
                    continue;
                }

                const [, day, month, year] = formatMatch;

                // Validate the date actually exists
                const date = new Date(
                    Number(year),
                    Number(month) - 1,
                    Number(day)
                );

                const isValidDate =
                    date.getFullYear() === Number(year) &&
                    date.getMonth() === Number(month) - 1 &&
                    date.getDate() === Number(day);

                if (!isValidDate) {
                    alert(
                        "Invalid date.\n" +
                        "Please enter a real calendar date."
                    );
                    continue;
                }

                return { value, date };

            }
        }

        const passportExpiry = promptDate(
            "Enter passport expiry date",
            data[PASSPORT_EXPIRY_DATE_FIELD]
        );

        let arrival, departure;

        while (true) {

            arrival = promptDate("Enter planned arrival date");
            departure = promptDate("Enter planned departure date");

            // Departure cannot be before arrival
            if (departure.date < arrival.date) {
                alert(
                    "❌ Departure date cannot be before arrival date.\n" +
                    `Invalid trip dates: ${arrival.value} → ${departure.value}`
                );
                continue;
            }

            break;

        }

        const MS_PER_DAY = 1000 * 60 * 60 * 24;
        const lengthOfStay = Math.round((departure.date - arrival.date) / MS_PER_DAY) + 1;

        const frame = getArrivalFrame();

        if (!frame?.contentDocument) {
            console.error("❌ E-Arrival Cards iframe not found.");
            return;
        }

        const doc = frame.contentDocument;

        const filled = [];
        const failed = [];

        function setItem(id, value) {

            const el = doc.getElementById(id);

            if (!el) {
                failed.push({ id, value, reason: "element not found" });
                return;
            }

            // Use APEX's own API when available
            try {
                const apexInFrame = frame.contentWindow.apex;
                if (apexInFrame?.item) {
                    const item = apexInFrame.item(id);
                    if (item?.setValue) {
                        item.setValue(value ?? "");
                        filled.push({ id, value, method: "APEX" });
                        return;
                    }
                }
            } catch (e) {
                // Fall through to DOM method
            }

            // DOM fallback
            try {

                if (el.type === "radio") {

                    const radios = doc.querySelectorAll(`input[name="${CSS.escape(id)}"]`);

                    let found = false;

                    radios.forEach(radio => {

                        const checked = String(radio.value) === String(value);
                        radio.checked = checked;

                        if (checked) {
                            radio.dispatchEvent(new Event("change", { bubbles: true }));
                            found = true;
                        }

                    });

                    if (found) {
                        filled.push({ id, value, method: "DOM radio" });
                        return;
                    }

                }

                el.value = value ?? "";

                el.dispatchEvent(new Event("input", { bubbles: true }));
                el.dispatchEvent(new Event("change", { bubbles: true }));

                filled.push({ id, value, method: "DOM" });

            } catch (e) {
                failed.push({ id, value, reason: String(e) });
            }

        }

        // Form requires 2-digit day and month (e.g. "01" not "1")
        const TWO_DIGIT_FIELDS = new Set(["P3422_DOB_DAY", "P3422_DOB_MONTH"]);
        const padTwoDigits = (value) => {
            const str = String(value ?? "").trim();
            return str.length === 1 ? `0${str}` : str;
        };

        for (const id of COPYABLE_FIELDS) {
            const value = TWO_DIGIT_FIELDS.has(id) ? padTwoDigits(data[id]) : data[id];
            setItem(id, value);
        }
        setItem(PASSPORT_EXPIRY_DATE_FIELD, passportExpiry.value);
        setItem("P3422_INTENDED_LENGTH_OF_STAY", lengthOfStay);
        setItem("P3422_PLANNED_DATE_OF_ARRIVAL", arrival.value);
        setItem("P3422_PLANNED_DATE_OF_DEPARTURE", departure.value);

        console.log(`Filled ${filled.length} fields.`);
        if (failed.length) {
            console.warn(`${failed.length} fields could not be filled.`);
            console.table(failed);
        }
        console.log("AUTOFILL COMPLETE - review the whole form before submitting.");
    }

    // ============ NAVIGATION CHAIN ============
    try {
        console.log("Step 1: opening E-Arrival Cards dialog...");
        const frame1 = await openEArrivalCardsDialog();

        console.log("Step 2: switching to Old E-Arrival Cards tab...");
        await clickWhenFound(
            (root) => findByText(root, 'a[role="tab"]', "Old E-Arrival Cards"),
            frame1.contentDocument,
            '"Old E-Arrival Cards" tab'
        );

        console.log("Step 3: opening a specific old card...");
        await clickWhenFound(
            (root) => root.querySelector(".a-CardView-fullLink"),
            frame1.contentDocument,
            "an old card entry",
            SETTLE_MS * 2 // detail view takes a moment to render
        );

        console.log("Step 4: extracting data from the old card view...");
        await waitFor(getArrivalFrame, document, "E-Arrival Card detail iframe");
        await sleep(SETTLE_MS);
        const data = extractFromCurrentCard();

        console.log("Step 5: closing the view (Batal / Cancel)...");
        await clickWhenFound(
            (root) => findByTextAny(root, "button", ["Batal", "Cancel"]),
            frame1.contentDocument,
            '"Batal / Cancel" button'
        );

        console.log("Step 6: reopening E-Arrival Cards, then Create E-Arrival Card...");
        const frame3 = await openEArrivalCardsDialog("E-Arrival Cards nav card (2nd time)");
        await clickWhenFound(
            (root) => findByText(root, "button", "Create E-Arrival Card"),
            frame3.contentDocument,
            '"Create E-Arrival Card" button',
            SETTLE_MS * 2 // blank form takes a moment to render
        );

        console.log("Step 7: waiting for the blank form, then autofilling...");
        await waitFor(
            (root) => findByText(root, "h2", "Identiti Diri"),
            getArrivalFrame().contentDocument,
            "blank form (Personal Identity section)"
        );
        await sleep(SETTLE_MS);

        autofillBlankCard(data);

        console.log("DONE. Review every field before submitting.");
    } catch (err) {
        console.error("Chain stopped:", err.message);
        console.error("Re-run from this point manually, or adjust selectors/timing above.");
    }

})();
