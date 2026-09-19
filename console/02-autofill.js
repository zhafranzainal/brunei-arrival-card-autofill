(() => {

    const data = window.__arrivalCardCopy;

    if (!data) {
        console.error("❌ __arrivalCardCopy not found.");
        console.error("Run the extraction script on the existing card first.");
        return;
    }

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
            const formatMatch =
                /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);

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
        data.P3422_IDENT_EXPIRY_DATE
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

    const frame = document.querySelector(
        'iframe[title="E-Arrival Cards"]'
    );

    if (!frame?.contentDocument) {
        console.error("❌ E-Arrival Cards iframe not found.");
        return;
    }

    const doc = frame.contentDocument;

    // Fields that are safe to copy from the existing card
    const fields = [

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
        "P3422_TRANSPORT_SHIP_NAME_OUT"

    ];

    const filled = [];
    const failed = [];

    function setItem(id, value) {

        const el = doc.getElementById(id);

        if (!el) {
            failed.push({
                id,
                value,
                reason: "element not found"
            });
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

                const radios = doc.querySelectorAll(
                    `input[name="${CSS.escape(id)}"]`
                );

                let found = false;

                radios.forEach(radio => {

                    const checked = String(radio.value) === String(value);
                    radio.checked = checked;

                    if (checked) {
                        radio.dispatchEvent(
                            new Event("change", { bubbles: true })
                        );
                        found = true;
                    }

                });

                if (found) {
                    filled.push({
                        id,
                        value,
                        method: "DOM radio"
                    });
                    return;
                }

            }

            el.value = value ?? "";

            el.dispatchEvent(
                new Event("input", { bubbles: true })
            );

            el.dispatchEvent(
                new Event("change", { bubbles: true })
            );

            filled.push({
                id,
                value,
                method: "DOM"
            });

        } catch (e) {
            failed.push({
                id,
                value,
                reason: String(e)
            });
        }

    }

    // Copy reusable fields from existing card
    for (const id of fields) {
        setItem(id, data[id]);
    }

    setItem(
        "P3422_IDENT_EXPIRY_DATE",
        passportExpiry.value
    );

    setItem(
        "P3422_INTENDED_LENGTH_OF_STAY",
        lengthOfStay
    );

    setItem(
        "P3422_PLANNED_DATE_OF_ARRIVAL",
        arrival.value
    );

    setItem(
        "P3422_PLANNED_DATE_OF_DEPARTURE",
        departure.value
    );

    console.log(`✅ Filled ${filled.length} fields.`);

    if (failed.length) {
        console.warn(`⚠️ ${failed.length} fields could not be filled.`);
        console.table(failed);
    }

    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("✅ AUTOFILL COMPLETE");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log(
        "⚠️ Review the entire form manually before submitting."
    );

})();
