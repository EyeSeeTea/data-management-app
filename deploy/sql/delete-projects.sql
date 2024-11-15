DELETE FROM
    datasetindicators;

DELETE FROM
    datasetoperands;

DELETE FROM
    visualization_organisationunits;

DELETE FROM
    sectiondataelements;

DELETE FROM
    section;

DELETE FROM
    datasetsource;

DELETE FROM
    completedatasetregistration;

DELETE FROM
    datasetelement;

DELETE FROM
    datainputperiod;

DELETE FROM
    dataset;

DELETE FROM
    orgunitgroupmembers
WHERE
    (organisationunitid) IN (
        SELECT
            ou.organisationunitid
        FROM
            organisationunit ou
            JOIN orgunitgroupmembers oug USING (organisationunitid)
        WHERE
            ou.hierarchylevel >= 3
    );

DELETE FROM
    userdatavieworgunits
WHERE
    (organisationunitid) IN (
        SELECT
            ou.organisationunitid
        FROM
            organisationunit ou
            JOIN userdatavieworgunits oug USING (organisationunitid)
        WHERE
            ou.hierarchylevel >= 3
    );

DELETE FROM
    usermembership
WHERE
    (organisationunitid) IN (
        SELECT
            ou.organisationunitid
        FROM
            organisationunit ou
            JOIN usermembership oug USING (organisationunitid)
        WHERE
            ou.hierarchylevel >= 3
    );

DELETE FROM
    userteisearchorgunits;

-- This fails
-- dhis2-# WHERE hierarchylevel = 3;
-- ERROR:  update or delete on table "organisationunit" violates foreign key constraint "fk_visualization_organisationunits_organisationunitid" on table "visualization_organisationunits"
-- DETAIL:  Key (organisationunitid)=(2606892) is still referenced from table "visualization_organisationunits"
DELETE FROM
    organisationunit
WHERE
    hierarchylevel >= 3;
