(() => {

    const frame = document.querySelector('iframe[title="E-Arrival Cards"]');
    const doc = frame ? frame.contentDocument : document;

    if (!doc) {
        console.error("❌ Cannot access iframe document");
        return;
    }

    const fields = [
        "P3422_FULL_NAME",
        "P3422_DOB_DAY",
        "P3422_DOB_MONTH",
        "P3422_DOB_YEAR",
        "P3422_GENDER_CODE",
        "P3422_PLACE_OF_BIRTH",
        "P3422_NATION_CODE_ICAO",
        "P3422_IDENT_DOCUMENT_NO",
        "P3422_PLACE_OF_ISSUE",
        "P3422_IDENT_EXPIRY_DATE",
        "P3422_FOREIGN_DOCUMENT_NO",

        "P3422_ADDRESS_HOME",
        "P3422_OCCUPATION",
        "P3422_Q_IS_FIRST_VISIT",
        "P3422_Q_IS_BACKPACK",
        "P3422_Q_IS_DIFFERENT_PASSPORT",
        "P3422_Q_HAS_PROHIBITED",
        "P3422_Q_HAS_A_OR_SA",
        "P3422_INTENDED_LENGTH_OF_STAY",
        "P3422_MOVEMENT_REASON_CODE",
        "P3422_MOVEMENT_REASON_OTHER",
        "P3422_ACCOMODATION_CODE",
        "P3422_ADDRESS_ACCOMODATION",

        "P3422_PLANNED_DATE_OF_ARRIVAL",
        "P3422_CAMPANION_COUNT_IN",
        "P3422_LAST_EMBARKATION",
        "P3422_TRANSPORT_FLIGHT_NO_IN",
        "P3422_TRANSPORT_VEHICLE_NO_IN",
        "P3422_TRANSPORT_SHIP_NAME_IN",

        "P3422_PLANNED_DATE_OF_DEPARTURE",
        "P3422_CAMPANION_COUNT_OUT",
        "P3422_IMMEDIATE_DESTINATION",
        "P3422_TRANSPORT_FLIGHT_NO_OUT",
        "P3422_TRANSPORT_VEHICLE_NO_OUT",
        "P3422_TRANSPORT_SHIP_NAME_OUT"
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

    console.log(
        "✅ Captured from the actual E-Arrival Cards iframe."
    );

})();
