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

    function click(el) {
        el.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    }

    function getArrivalFrame() {
        return document.querySelector('iframe[title="E-Arrival Cards"]');
    }

    function extractFromCurrentCard() {
        const frame = getArrivalFrame();
        const doc = frame ? frame.contentDocument : document;
        if (!doc) throw new Error("Cannot access iframe document");

        const fields = [
            "P3422_FULL_NAME", "P3422_DOB_DAY", "P3422_DOB_MONTH", "P3422_DOB_YEAR",
            "P3422_GENDER_CODE", "P3422_PLACE_OF_BIRTH", "P3422_NATION_CODE_ICAO",
            "P3422_IDENT_DOCUMENT_NO", "P3422_PLACE_OF_ISSUE", "P3422_IDENT_EXPIRY_DATE",
            "P3422_FOREIGN_DOCUMENT_NO", "P3422_ADDRESS_HOME", "P3422_OCCUPATION",
            "P3422_Q_IS_FIRST_VISIT", "P3422_Q_IS_BACKPACK", "P3422_Q_IS_DIFFERENT_PASSPORT",
            "P3422_Q_HAS_PROHIBITED", "P3422_Q_HAS_A_OR_SA", "P3422_INTENDED_LENGTH_OF_STAY",
            "P3422_MOVEMENT_REASON_CODE", "P3422_MOVEMENT_REASON_OTHER",
            "P3422_ACCOMODATION_CODE", "P3422_ADDRESS_ACCOMODATION",
            "P3422_PLANNED_DATE_OF_ARRIVAL", "P3422_CAMPANION_COUNT_IN",
            "P3422_LAST_EMBARKATION", "P3422_TRANSPORT_FLIGHT_NO_IN",
            "P3422_TRANSPORT_VEHICLE_NO_IN", "P3422_TRANSPORT_SHIP_NAME_IN",
            "P3422_PLANNED_DATE_OF_DEPARTURE", "P3422_CAMPANION_COUNT_OUT",
            "P3422_IMMEDIATE_DESTINATION", "P3422_TRANSPORT_FLIGHT_NO_OUT",
            "P3422_TRANSPORT_VEHICLE_NO_OUT", "P3422_TRANSPORT_SHIP_NAME_OUT",
        ];

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
        const existingExpiry = data.P3422_IDENT_EXPIRY_DATE?.trim();
        let passportExpiry = existingExpiry;

        if (!passportExpiry) {
            while (true) {
                const input = prompt("Enter passport expiry date (DD.MM.YYYY):");
                if (input === null) {
                    alert("Passport expiry date is required.");
                    continue;
                }
                const value = input.trim();
                const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
                if (!m) {
                    alert("Invalid format. Please enter exactly DD.MM.YYYY, e.g. 31.12.2040");
                    continue;
                }
                const [, day, month, year] = m;
                const date = new Date(Number(year), Number(month) - 1, Number(day));
                const valid =
                    date.getFullYear() === Number(year) &&
                    date.getMonth() === Number(month) - 1 &&
                    date.getDate() === Number(day);
                if (!valid) {
                    alert("Invalid date. Please enter a real calendar date.");
                    continue;
                }
                passportExpiry = value;
                break;
            }
        }

        const frame = getArrivalFrame();
        if (!frame?.contentDocument) throw new Error("E-Arrival Cards iframe not found");
        const doc = frame.contentDocument;

        const fields = [
            "P3422_FULL_NAME", "P3422_DOB_DAY", "P3422_DOB_MONTH", "P3422_DOB_YEAR",
            "P3422_GENDER_CODE", "P3422_PLACE_OF_BIRTH", "P3422_NATION_CODE_ICAO",
            "P3422_IDENT_DOCUMENT_NO", "P3422_PLACE_OF_ISSUE", "P3422_FOREIGN_DOCUMENT_NO",
            "P3422_ADDRESS_HOME", "P3422_OCCUPATION", "P3422_Q_IS_FIRST_VISIT",
            "P3422_Q_IS_BACKPACK", "P3422_Q_IS_DIFFERENT_PASSPORT", "P3422_Q_HAS_PROHIBITED",
            "P3422_Q_HAS_A_OR_SA", "P3422_INTENDED_LENGTH_OF_STAY", "P3422_MOVEMENT_REASON_CODE",
            "P3422_MOVEMENT_REASON_OTHER", "P3422_ACCOMODATION_CODE", "P3422_ADDRESS_ACCOMODATION",
            "P3422_PLANNED_DATE_OF_ARRIVAL", "P3422_CAMPANION_COUNT_IN", "P3422_LAST_EMBARKATION",
            "P3422_TRANSPORT_FLIGHT_NO_IN", "P3422_TRANSPORT_VEHICLE_NO_IN",
            "P3422_TRANSPORT_SHIP_NAME_IN", "P3422_PLANNED_DATE_OF_DEPARTURE",
            "P3422_CAMPANION_COUNT_OUT", "P3422_IMMEDIATE_DESTINATION",
            "P3422_TRANSPORT_FLIGHT_NO_OUT", "P3422_TRANSPORT_VEHICLE_NO_OUT",
            "P3422_TRANSPORT_SHIP_NAME_OUT",
        ];

        const filled = [];
        const failed = [];

        function setItem(id, value) {
            const el = doc.getElementById(id);
            if (!el) {
                failed.push({ id, value, reason: "element not found" });
                return;
            }
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
            } catch { }

            try {
                if (el.type === "radio") {
                    const radios = doc.querySelectorAll(`input[name="${CSS.escape(id)}"]`);
                    let found = false;
                    radios.forEach((radio) => {
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

        for (const id of fields) setItem(id, data[id]);
        setItem("P3422_IDENT_EXPIRY_DATE", passportExpiry);

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
        const navLink = await waitFor(
            (root) => findByText(root, 'a[aria-roledescription="dialog link"]', "E-Arrival Cards"),
            document,
            "E-Arrival Cards nav card"
        );
        click(navLink);
        await sleep(SETTLE_MS);

        console.log("Step 2: waiting for iframe + switching to Old E-Arrival Cards tab...");
        const frame1 = await waitFor(getArrivalFrame, document, "E-Arrival Cards iframe");
        await sleep(SETTLE_MS);
        const oldTab = await waitFor(
            (root) => findByText(root, 'a[role="tab"]', "Old E-Arrival Cards"),
            frame1.contentDocument,
            '"Old E-Arrival Cards" tab'
        );
        click(oldTab);
        await sleep(SETTLE_MS);

        console.log("Step 3: opening a specific old card...");
        const oldCardLink = await waitFor(
            (root) => root.querySelector(".a-CardView-fullLink"),
            frame1.contentDocument,
            "an old card entry"
        );
        click(oldCardLink);
        await sleep(SETTLE_MS * 2); // detail view takes a moment to render

        console.log("Step 4: extracting data from the old card view...");
        const frame2 = await waitFor(getArrivalFrame, document, "E-Arrival Card detail iframe");
        await sleep(SETTLE_MS);
        const data = extractFromCurrentCard.call(null); // uses getArrivalFrame() internally
        void frame2;

        console.log("Step 5: closing the view (Batal / Cancel)...");
        const cancelBtn = await waitFor(
            (root) => findByText(root, "button", "Batal") || findByText(root, "button", "Cancel"),
            frame1.contentDocument,
            '"Batal / Cancel" button'
        );
        click(cancelBtn);
        await sleep(SETTLE_MS);

        console.log("Step 6: reopening E-Arrival Cards, then Create E-Arrival Card...");
        const navLink2 = await waitFor(
            (root) => findByText(root, 'a[aria-roledescription="dialog link"]', "E-Arrival Cards"),
            document,
            "E-Arrival Cards nav card (2nd time)"
        );
        click(navLink2);
        await sleep(SETTLE_MS);

        const frame3 = await waitFor(getArrivalFrame, document, "E-Arrival Cards iframe (2nd time)");
        await sleep(SETTLE_MS);
        const createBtn = await waitFor(
            (root) => findByText(root, "button", "Create E-Arrival Card"),
            frame3.contentDocument,
            '"Create E-Arrival Card" button'
        );
        click(createBtn);
        await sleep(SETTLE_MS * 2); // blank form takes a moment to render

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
