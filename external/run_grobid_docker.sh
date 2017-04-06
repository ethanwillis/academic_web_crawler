docker images | grep lfoppiano/grobid | grep 0.4.1
docker run -t --rm -p 8080:8080 $image_id_from_previous_command
