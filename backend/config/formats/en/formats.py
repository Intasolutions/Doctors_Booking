# Date and time formats for the Django admin: dd/mm/yyyy and 12-hour clock.
DATE_FORMAT = "d/m/Y"
SHORT_DATE_FORMAT = "d/m/Y"
TIME_FORMAT = "g:i A"
DATETIME_FORMAT = "d/m/Y g:i A"
SHORT_DATETIME_FORMAT = "d/m/Y g:i A"
DATE_INPUT_FORMATS = ["%d/%m/%Y", "%Y-%m-%d"]
TIME_INPUT_FORMATS = ["%I:%M %p", "%I:%M%p", "%H:%M", "%H:%M:%S"]
DATETIME_INPUT_FORMATS = ["%d/%m/%Y %I:%M %p", "%d/%m/%Y %H:%M", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d %H:%M"]
FIRST_DAY_OF_WEEK = 1
