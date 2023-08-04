#/bin/sh

FILENAME=$(date '+%Y-%m-%dT%H_%M_%S%z').sql.bz2
DATABASE=bibliotheca_parva

for P in $@
do
    PATHS="$PATHS ${P%*/}/$FILENAME"
done

pg_dump $DATABASE | bzip2 | tee $PATHS > /dev/null